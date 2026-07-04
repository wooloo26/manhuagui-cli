import { createRequire } from "node:module";
import { join } from "node:path";
import { intro, isCancel, outro, spinner } from "@clack/prompts";
import { defineCommand } from "citty";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { createBrowserContext } from "./browser.js";
import { parseComicPage } from "./comic.js";
import { applyLogLevel, config, initConfig, type UserConfigOverrides } from "./config.js";
import { CanceledError } from "./errors.js";
import { logger } from "./logger.js";
import {
  buildChapterIndexMap,
  chapterKey,
  filterSectionsForResume,
  loadProgress,
} from "./progress.js";
import {
  promptConfirm,
  promptOverwriteCheck,
  promptResume,
  promptSections,
  promptUrl,
} from "./prompts.js";
import {
  countTotalPages,
  displayDryRun,
  filterSectionsByNames,
  logSectionSummary,
  reportResults,
} from "./reporting.js";
import { runPipeline } from "./tasks.js";
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

async function runDownloadFlow(opts: {
  sections: Section[];
  comic: ComicInfo;
  url: string;
  browser: Browser;
  resume: boolean;
  overwrite: boolean;
  dryRun: boolean;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  onAllDone: (msg: string) => void;
}): Promise<void> {
  const { sections, comic, url, browser, resume, overwrite, dryRun, info, warn, onAllDone } = opts;
  const chapterIndexMap = buildChapterIndexMap(sections);
  const totalPagesExpected = countTotalPages(sections);
  const comicDir = join(config.outputBase, slugify(comic.title));
  const filtered = filterSectionsForResume(sections, comicDir, resume, overwrite);
  if (filtered === null) {
    onAllDone("All chapters already downloaded.");
    return;
  }
  const finalSections = filtered;
  const totalChapters = logSectionSummary(finalSections, info);
  if (dryRun) {
    displayDryRun(finalSections, info);
    return;
  }
  const result = await runPipeline({
    sections: finalSections,
    chapterIndexMap,
    comicTitle: comic.title,
    comicUrl: url,
    browser,
    cfg: config,
    resume,
    overwrite,
    totalPagesExpected,
  });
  reportResults(result, totalChapters, info, warn);
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
    const sections = filterSectionsByNames(comic.sections, sectionFilter, chapterFilter);
    if (sections.length === 0) {
      throw new Error("No chapters found matching filters");
    }
    await runDownloadFlow({
      sections,
      comic,
      url,
      browser,
      resume,
      overwrite,
      dryRun,
      info: (m) => logger.info(m),
      warn: (m) => logger.warn(m),
      onAllDone: (m) => logger.info(m),
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
    const selected = await promptSections(comic.sections, initialSections);
    const confirmed = await promptConfirm(selected.reduce((sum, s) => sum + s.chapters.length, 0));
    if (!confirmed || isCancel(confirmed)) {
      outro("Cancelled.");
      return;
    }
    await runDownloadFlow({
      sections: selected,
      comic,
      url,
      browser,
      resume: shouldResume,
      overwrite: shouldOverwrite,
      dryRun,
      info: (m) => logger.info(m),
      warn: (m) => logger.warn(m),
      onAllDone: (m) => outro(m),
    });
  } finally {
    await browser.close();
  }
}

export const command = defineCommand({
  meta: {
    name: "manhuagui-cli",
    version: pkg.version,
    description:
      "\u6F2B\u753B\u67DC (manhuagui.com) \u6F2B\u753B\u4E0B\u8F7D\u5DE5\u5177 / CLI tool for downloading manhua",
  },
  args: {
    url: {
      type: "positional",
      description: "\u6F2B\u753B URL / Comic URL",
      required: false,
    },
    section: {
      type: "string",
      description: "\u6307\u5B9A\u7AE0\u8282\u7EC4\u540D\u79F0 / Section name to download",
      alias: "s",
    },
    chapter: {
      type: "string",
      description: "\u6307\u5B9A\u7AE0\u8282\u540D\u79F0 / Chapter name to download",
      alias: "c",
    },
    resume: {
      type: "boolean",
      description: "\u65AD\u70B9\u7EED\u4F20 / Resume from previous download",
      alias: "r",
      default: false,
    },
    overwrite: {
      type: "boolean",
      description:
        "\u7EED\u4F20\u65F6\u8986\u76D6\u672A\u5B8C\u6210\u7684\u7AE0\u8282 / Overwrite unfinished chapters when resuming",
      alias: "O",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "\u9884\u89C8\u6A21\u5F0F / Preview without downloading",
      alias: "d",
      default: false,
    },
    output: {
      type: "string",
      description: "\u4E0B\u8F7D\u8F93\u51FA\u76EE\u5F55 / Output directory for downloads",
      alias: "o",
    },
    concurrency: {
      type: "string",
      description:
        "\u7AE0\u8282\u5185\u56FE\u7247\u5E76\u53D1\u4E0B\u8F7D\u6570 / Concurrent image downloads per chapter",
      alias: "C",
    },
    retry: {
      type: "string",
      description: "\u56FE\u7247\u4E0B\u8F7D\u91CD\u8BD5\u6B21\u6570 / Retry count per image",
    },
    "log-level": {
      type: "string",
      description: "\u65E5\u5FD7\u7EA7\u522B: debug | info | warn | error / Log level",
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
      if (err instanceof CanceledError) {
        outro("Cancelled.");
        return;
      }
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  },
});
