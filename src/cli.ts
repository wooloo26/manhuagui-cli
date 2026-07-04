import { join } from "node:path";
import { intro, isCancel, outro, spinner } from "@clack/prompts";
import { defineCommand } from "citty";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { createBrowserContext } from "./browser.js";
import { parseComicPage } from "./comic.js";
import { config, initConfig, type UserConfigOverrides } from "./config.js";
import { CancelledError } from "./errors.js";
import { logger } from "./logger.js";
import { chapterKey, filterPending, loadProgress } from "./progress.js";
import {
  promptConfirm,
  promptOverwriteCheck,
  promptResume,
  promptSections,
  promptUrl,
} from "./prompts.js";
import { type PipelineResult, runPipeline } from "./tasks.js";
import type { ComicInfo, Section } from "./types.js";
import { slugify } from "./utils.js";

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

async function parseComicWithSpinner(browser: Browser, url: string): Promise<ComicInfo> {
  const ctx = await createBrowserContext(browser);
  const page = await ctx.newPage();

  const s = spinner();
  s.start("Parsing comic page");
  const comic = await parseComicPage(page, url);
  await ctx.close();
  s.stop(comic.title);
  return comic;
}

export function applyFilters(
  sections: Section[],
  sectionFilter?: string,
  chapterFilter?: string,
): Section[] {
  let result = sections;
  if (sectionFilter) {
    result = result.filter((s) => s.name === sectionFilter || s.name.includes(sectionFilter));
  }
  if (chapterFilter) {
    result = result
      .map((s) => ({
        ...s,
        chapters: s.chapters.filter(
          (c) => c.title === chapterFilter || c.title.includes(chapterFilter),
        ),
      }))
      .filter((s) => s.chapters.length > 0);
  }
  return result;
}

function logSectionSummary(sections: Section[]): number {
  const total = sections.reduce((sum, s) => sum + s.chapters.length, 0);
  logger.info(`Sections: ${sections.map((s) => `${s.name}(${s.chapters.length})`).join(", ")}`);
  logger.info(`Total chapters: ${total}`);
  return total;
}

function displayDryRun(sections: Section[]): void {
  for (const section of sections) {
    for (const ch of section.chapters) {
      logger.info(`  [${section.name}] ${ch.title}`);
    }
  }
  logger.info("Dry run complete. No files downloaded.");
}

function reportResults(result: PipelineResult, attempted: number): void {
  logger.info(`Done. ${result.ok} OK, ${result.failed} failed, ${attempted} total attempted.`);
  if (Object.keys(result.collected).length > 0) {
    logger.info(`Downloaded ${Object.keys(result.collected).length} chapters.`);
  }
  if (result.errors.length > 0) {
    logger.warn(`${result.errors.length} errors:`);
    for (const e of result.errors) logger.warn(`  - ${e}`);
  }
}

function buildChapterIndexMap(sections: Section[]): Map<string, number> {
  const map = new Map<string, number>();
  let idx = 0;
  for (const s of sections) {
    for (const c of s.chapters) {
      map.set(chapterKey(s.name, c.title), ++idx);
    }
  }
  return map;
}

async function executeAndReport(opts: {
  sections: Section[];
  chapterIndexMap: Map<string, number>;
  comic: ComicInfo;
  url: string;
  browser: Browser;
  resume: boolean;
  overwrite: boolean;
  totalChapters: number;
  totalPagesExpected: number;
}): Promise<void> {
  const {
    sections,
    chapterIndexMap,
    comic,
    url,
    browser,
    resume,
    overwrite,
    totalChapters,
    totalPagesExpected,
  } = opts;
  const result = await runPipeline({
    sections,
    chapterIndexMap,
    comicTitle: comic.title,
    comicUrl: url,
    browser,
    resume,
    overwrite,
    totalPagesExpected,
  });
  reportResults(result, totalChapters);
}

// interactive mode only
async function promptResumeCheck(opts: {
  comic: ComicInfo;
  sections: Section[];
  resume: boolean;
  comicDir: string;
}): Promise<boolean> {
  const { comic: _comic, sections, resume, comicDir } = opts;
  if (resume) return true;

  const progress = loadProgress(comicDir);
  if (!progress) return false;

  let done = 0;
  let total = 0;
  for (const s of sections) {
    for (const c of s.chapters) {
      total++;
      if (progress.chapters[chapterKey(s.name, c.title)]?.status === "done") done++;
    }
  }
  if (total > 0 && done > 0) {
    return promptResume(done, total);
  }
  return false;
}

async function runDirect(opts: {
  url: string;
  sectionFilter: string | undefined;
  chapterFilter: string | undefined;
  resume: boolean;
  overwrite: boolean;
  dryRun: boolean;
}) {
  const { url, sectionFilter, chapterFilter, resume, overwrite, dryRun } = opts;
  const browser = await launchBrowser();

  try {
    const comic = await parseComicWithSpinner(browser, url);
    let sections = applyFilters(comic.sections, sectionFilter, chapterFilter);

    if (sections.length === 0) {
      throw new Error("No chapters found matching filters");
    }

    const chapterIndexMap = buildChapterIndexMap(sections);

    const totalPagesExpected = sections.reduce(
      (sum, s) => sum + s.chapters.reduce((cs, c) => cs + c.pageCount, 0),
      0,
    );

    if (resume) {
      const comicDir = join(config.outputBase, slugify(comic.title));
      const progress = loadProgress(comicDir);
      if (progress) {
        sections = filterPending(progress, sections, overwrite);
        if (sections.length === 0) {
          logger.info("All chapters already downloaded.");
          return;
        }
      }
    }

    const totalChapters = logSectionSummary(sections);

    if (dryRun) {
      displayDryRun(sections);
      return;
    }

    await executeAndReport({
      sections,
      chapterIndexMap,
      comic,
      url,
      browser,
      resume,
      overwrite,
      totalChapters,
      totalPagesExpected,
    });
  } finally {
    await browser.close();
  }
}

async function runInteractive(resume: boolean, overwrite: boolean, dryRun: boolean) {
  intro("Manhuagui Scraper");

  const url = await promptUrl();
  const browser = await launchBrowser();

  try {
    const comic = await parseComicWithSpinner(browser, url);

    const comicDir = join(config.outputBase, slugify(comic.title));
    const shouldResume = await promptResumeCheck({
      comic,
      sections: comic.sections,
      resume,
      comicDir,
    });

    let shouldOverwrite = overwrite;
    if (shouldResume && !overwrite) {
      shouldOverwrite = await promptOverwriteCheck();
    }

    let selected = await promptSections(comic.sections);

    const chapterIndexMap = buildChapterIndexMap(selected);

    const totalPagesExpected = selected.reduce(
      (sum, s) => sum + s.chapters.reduce((cs, c) => cs + c.pageCount, 0),
      0,
    );

    if (shouldResume) {
      const progress = loadProgress(comicDir);
      if (progress) {
        selected = filterPending(progress, selected, shouldOverwrite);
        if (selected.length === 0) {
          outro("All chapters already downloaded.");
          return;
        }
      }
    }

    const totalChapters = logSectionSummary(selected);

    const confirmed = await promptConfirm(totalChapters);
    if (!confirmed || isCancel(confirmed)) {
      outro("Cancelled.");
      return;
    }

    if (dryRun) {
      displayDryRun(selected);
      outro(`Dry run complete. ${totalChapters} chapters would be downloaded.`);
      return;
    }

    await executeAndReport({
      sections: selected,
      chapterIndexMap,
      comic,
      url,
      browser,
      resume: shouldResume,
      overwrite: shouldOverwrite,
      totalChapters,
      totalPagesExpected,
    });
  } finally {
    await browser.close();
  }
}

export const command = defineCommand({
  meta: {
    name: "manhuagui-cli",
    version: "1.0.0",
    description: "漫画柜 (manhuagui.com) 漫画下载工具 / CLI tool for downloading manhua",
  },
  args: {
    url: {
      type: "positional",
      description: "漫画 URL / Comic URL",
      required: false,
    },
    section: {
      type: "string",
      description: "指定章节组名称 / Section name to download",
      alias: "s",
    },
    chapter: {
      type: "string",
      description: "指定章节名称 / Chapter name to download",
      alias: "c",
    },
    resume: {
      type: "boolean",
      description: "断点续传 / Resume from previous download",
      alias: "r",
      default: false,
    },
    overwrite: {
      type: "boolean",
      description: "覆盖已下载章节 / Overwrite previously downloaded chapters",
      alias: "O",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "预览模式 / Preview without downloading",
      alias: "d",
      default: false,
    },
    output: {
      type: "string",
      description: "下载输出目录 / Output directory for downloads",
      alias: "o",
    },
    concurrency: {
      type: "string",
      description: "章节内图片并发下载数 / Concurrent image downloads per chapter",
      alias: "C",
    },
    retry: {
      type: "string",
      description: "图片下载重试次数 / Retry count per image",
    },
    "log-level": {
      type: "string",
      description: "日志级别: debug | info | warn | error / Log level",
    },
  },
  async run({ args }) {
    const cliOverrides: UserConfigOverrides = {};
    if (args.output) cliOverrides.outputBase = args.output;
    if (args.concurrency) cliOverrides.imageConcurrency = Number(args.concurrency);
    if (args.retry) cliOverrides.retryCount = Number(args.retry);
    if (args["log-level"] && ["debug", "info", "warn", "error"].includes(args["log-level"])) {
      cliOverrides.logLevel = args["log-level"] as UserConfigOverrides["logLevel"];
    }
    initConfig(cliOverrides);
    try {
      if (args.url) {
        await runDirect({
          url: args.url,
          sectionFilter: args.section,
          chapterFilter: args.chapter,
          resume: args.resume,
          overwrite: args.overwrite,
          dryRun: args["dry-run"],
        });
      } else {
        await runInteractive(args.resume, args.overwrite, args["dry-run"]);
      }
    } catch (err) {
      if (err instanceof CancelledError) {
        outro("Cancelled.");
        return;
      }
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  },
});
