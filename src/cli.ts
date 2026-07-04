import { createRequire } from "node:module";
import { join } from "node:path";
import { intro, isCancel, outro, spinner } from "@clack/prompts";
import { defineCommand } from "citty";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { createBrowserContext } from "./browser.js";
import { parseComicPage } from "./comic.js";
import { applyLogLevel, config, initConfig, type UserConfigOverrides } from "./config.js";
import { CancelledError } from "./errors.js";
import { logger } from "./logger.js";
import {
  buildChapterIndexMap,
  executeDownloadFlow,
  filterSectionsForResume,
} from "./pipeline-orchestrator.js";
import { chapterKey, loadProgress } from "./progress.js";
import {
  promptConfirm,
  promptOverwriteCheck,
  promptResume,
  promptSections,
  promptUrl,
} from "./prompts.js";
import {
  applyFilters,
  countTotalPages,
  displayDryRun,
  logSectionSummary,
  reportResults,
} from "./reporting.js";
import type { ComicInfo, Section } from "./types.js";
import { slugify } from "./utils.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

async function parseComicWithSpinner(browser: Browser, url: string): Promise<ComicInfo> {
  const ctx = await createBrowserContext(browser, config);
  const page = await ctx.newPage();
  const s = spinner();
  s.start("Parsing comic page");
  const comic = await parseComicPage(page, url, config);
  await ctx.close();
  s.stop(comic.title);
  return comic;
}

async function promptResumeCheck(opts: {
  sections: Section[];
  resume: boolean;
  comicDir: string;
}): Promise<boolean> {
  const { sections, resume, comicDir } = opts;
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
    const totalPagesExpected = countTotalPages(sections);
    const comicDir = join(config.outputBase, slugify(comic.title));
    const filtered = filterSectionsForResume(sections, comicDir, resume, overwrite);
    if (filtered === null) {
      logger.info("All chapters already downloaded.");
      return;
    }
    sections = filtered;
    const totalChapters = logSectionSummary(sections, (m) => logger.info(m));
    if (dryRun) {
      displayDryRun(sections, (m) => logger.info(m));
      return;
    }
    const result = await executeDownloadFlow({
      sections,
      chapterIndexMap,
      comic,
      url,
      browser,
      cfg: config,
      resume,
      overwrite,
      totalChapters,
      totalPagesExpected,
    });
    reportResults(
      result,
      totalChapters,
      (m) => logger.info(m),
      (m) => logger.warn(m),
    );
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
      sections: comic.sections,
      resume,
      comicDir,
    });
    let shouldOverwrite = overwrite;
    if (shouldResume && !overwrite) {
      shouldOverwrite = await promptOverwriteCheck();
    }
    let initialSections: string[] | undefined;
    if (shouldResume) {
      const progress = loadProgress(comicDir);
      if (progress) {
        initialSections = comic.sections
          .filter((s) =>
            s.chapters.some((c) => {
              const p = progress.chapters[chapterKey(s.name, c.title)];
              return p && p.status !== "done";
            }),
          )
          .map((s) => s.name);
      }
    }
    let selected = await promptSections(comic.sections, initialSections);
    const chapterIndexMap = buildChapterIndexMap(selected);
    const totalPagesExpected = countTotalPages(selected);
    const filtered = filterSectionsForResume(selected, comicDir, shouldResume, shouldOverwrite);
    if (filtered === null) {
      outro("All chapters already downloaded.");
      return;
    }
    selected = filtered;
    const totalChapters = logSectionSummary(selected, (m) => logger.info(m));
    const confirmed = await promptConfirm(totalChapters);
    if (!confirmed || isCancel(confirmed)) {
      outro("Cancelled.");
      return;
    }
    if (dryRun) {
      displayDryRun(selected, (m) => logger.info(m));
      outro(`Dry run complete. ${totalChapters} chapters would be downloaded.`);
      return;
    }
    const result = await executeDownloadFlow({
      sections: selected,
      chapterIndexMap,
      comic,
      url,
      browser,
      cfg: config,
      resume: shouldResume,
      overwrite,
      totalChapters,
      totalPagesExpected,
    });
    reportResults(
      result,
      totalChapters,
      (m) => logger.info(m),
      (m) => logger.warn(m),
    );
  } finally {
    await browser.close();
  }
}

export const command = defineCommand({
  meta: {
    name: "manhuagui-cli",
    version: pkg.version,
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
      description: "续传时覆盖未完成的章节 / Overwrite unfinished chapters when resuming",
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
    applyLogLevel(config.logLevel);
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
