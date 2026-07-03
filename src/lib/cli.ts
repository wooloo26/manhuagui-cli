import { join } from "node:path";
import { intro, isCancel, outro, spinner } from "@clack/prompts";
import { defineCommand } from "citty";
import { Listr } from "listr2";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { extractChapterImages } from "./chapter.js";
import { parseComicPage } from "./comic.js";
import {
  CHAPTER_DELAY_MAX,
  CHAPTER_DELAY_MIN,
  OUTPUT_BASE,
  pickUserAgent,
  VIEWPORT_MAX_HEIGHT,
  VIEWPORT_MAX_WIDTH,
  VIEWPORT_MIN_HEIGHT,
  VIEWPORT_MIN_WIDTH,
} from "./config.js";
import { CancelledError } from "./errors.js";
import { logger } from "./logger.js";
import {
  chapterKey,
  createProgress,
  filterPending,
  loadProgress,
  markChapter,
  saveProgress,
} from "./progress.js";
import { promptConfirm, promptResume, promptSections, promptUrl } from "./prompts.js";
import type { Chapter, ComicInfo, Section } from "./types.js";
import { atomicSaveJSON, humanDelay, randInt, slugify } from "./utils.js";

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

async function parseComicWithSpinner(browser: Browser, url: string): Promise<ComicInfo> {
  const ctx = await browser.newContext({
    userAgent: pickUserAgent(),
    viewport: {
      width: randInt(VIEWPORT_MIN_WIDTH, VIEWPORT_MAX_WIDTH),
      height: randInt(VIEWPORT_MIN_HEIGHT, VIEWPORT_MAX_HEIGHT),
    },
  });
  const page = await ctx.newPage();

  const s = spinner();
  s.start("Parsing comic page");
  const comic = await parseComicPage(page, url);
  await ctx.close();
  s.stop(comic.title);
  return comic;
}

function applyFilters(
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

function reportResults(
  collected: Record<string, { urls: string[]; chapterUrl: string }>,
  errors: string[],
  totalChapters: number,
): void {
  if (Object.keys(collected).length > 0) {
    logger.info(`Downloaded ${Object.keys(collected).length}/${totalChapters} chapters`);
  }
  if (errors.length > 0) {
    logger.warn(`${errors.length} errors:`);
    for (const e of errors) logger.warn(`  ! ${e}`);
  }
  logger.info(`Done. Processed ${totalChapters} chapters.`);
}

async function processChapter(
  chapter: Chapter,
  sectionName: string,
  comicTitle: string,
  browser: Browser,
): Promise<{ title: string; urls: string[]; chapterUrl: string } | null> {
  const dirName = slugify(chapter.title);
  const outputDir = join(OUTPUT_BASE, slugify(comicTitle), slugify(sectionName), dirName);

  const urls = await extractChapterImages(chapter.url, browser, outputDir);
  if (urls.length === 0) return null;

  return { title: chapter.title, urls, chapterUrl: chapter.url };
}

function createDownloadTasks(
  sections: Section[],
  comicTitle: string,
  comicUrl: string,
  browser: Browser,
  resume: boolean,
) {
  const collected: Record<string, { urls: string[]; chapterUrl: string }> = {};
  const errors: string[] = [];
  const comicDir = join(OUTPUT_BASE, slugify(comicTitle));
  const progress = resume
    ? (loadProgress(comicDir) ?? createProgress(comicTitle, comicUrl))
    : createProgress(comicTitle, comicUrl);
  saveProgress(comicDir, progress);

  return {
    collected,
    errors,
    tasks: new Listr(
      sections.map((section) => ({
        title: section.name,
        task: async (_, task) => {
          const total = section.chapters.length;
          const label = section.name;

          for (let i = 0; i < section.chapters.length; i++) {
            const ch = section.chapters[i];
            task.title = `${label}  ${i + 1}/${total}`;

            try {
              const r = await processChapter(ch, section.name, comicTitle, browser);
              if (r) {
                collected[r.title] = { urls: r.urls, chapterUrl: r.chapterUrl };
                markChapter(comicDir, progress, chapterKey(section.name, ch.title), "done", {
                  pageCount: r.urls.length,
                });
              } else {
                markChapter(comicDir, progress, chapterKey(section.name, ch.title), "failed", {
                  error: "No images found",
                });
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              errors.push(`${ch.title}: ${errMsg}`);
              markChapter(comicDir, progress, chapterKey(section.name, ch.title), "failed", {
                error: errMsg,
              });
            }

            if (i < section.chapters.length - 1) {
              await humanDelay(CHAPTER_DELAY_MIN, CHAPTER_DELAY_MAX);
            }
          }

          task.title = label;
        },
      })),
      {
        concurrent: false,
        rendererOptions: { collapseSubtasks: false },
      },
    ),
  };
}

async function runDirect(
  url: string,
  sectionFilter: string | undefined,
  chapterFilter: string | undefined,
  resume: boolean,
  dryRun: boolean,
) {
  const browser = await launchBrowser();

  try {
    const comic = await parseComicWithSpinner(browser, url);
    let sections = applyFilters(comic.sections, sectionFilter, chapterFilter);

    if (sections.length === 0) {
      throw new Error("No chapters found matching filters");
    }

    if (resume) {
      const comicDir = join(OUTPUT_BASE, slugify(comic.title));
      const progress = loadProgress(comicDir);
      if (progress) {
        sections = filterPending(progress, sections);
        if (sections.length === 0) {
          logger.info("All chapters already downloaded.");
          return;
        }
      }
    }

    const totalChapters = sections.reduce((sum, s) => sum + s.chapters.length, 0);
    logger.info(`Sections: ${sections.map((s) => `${s.name}(${s.chapters.length})`).join(", ")}`);
    logger.info(`Total chapters: ${totalChapters}`);

    if (dryRun) {
      for (const section of sections) {
        for (const ch of section.chapters) {
          logger.info(`  [${section.name}] ${ch.title}`);
        }
      }
      logger.info("Dry run complete. No files downloaded.");
      return;
    }

    const {
      collected,
      errors,
      tasks: dl,
    } = createDownloadTasks(sections, comic.title, url, browser, resume);
    await dl.run();
    if (Object.keys(collected).length > 0) {
      atomicSaveJSON(join(OUTPUT_BASE, slugify(comic.title), "urls.json"), collected);
    }
    reportResults(collected, errors, totalChapters);
  } finally {
    await browser.close();
  }
}

async function runInteractive(resume: boolean, dryRun: boolean) {
  intro("Manhuagui Scraper");

  const url = await promptUrl();
  const browser = await launchBrowser();

  try {
    const comic = await parseComicWithSpinner(browser, url);

    let shouldResume = resume;
    const comicDir = join(OUTPUT_BASE, slugify(comic.title));
    const progress = loadProgress(comicDir);

    if (progress && !resume) {
      let done = 0;
      let total = 0;
      for (const s of comic.sections) {
        for (const c of s.chapters) {
          total++;
          if (progress.chapters[chapterKey(s.name, c.title)]?.status === "done") done++;
        }
      }
      if (total > 0 && done > 0) {
        shouldResume = await promptResume(done, total);
      }
    }

    let selected = await promptSections(comic.sections);

    if (shouldResume && progress) {
      selected = filterPending(progress, selected);
      if (selected.length === 0) {
        outro("All chapters already downloaded.");
        return;
      }
    }

    const totalChapters = selected.reduce((sum, s) => sum + s.chapters.length, 0);

    const confirmed = await promptConfirm(totalChapters);
    if (!confirmed || isCancel(confirmed)) {
      outro("Cancelled.");
      return;
    }

    if (dryRun) {
      for (const section of selected) {
        for (const ch of section.chapters) {
          logger.info(`  [${section.name}] ${ch.title}`);
        }
      }
      outro(`Dry run complete. ${totalChapters} chapters would be downloaded.`);
      return;
    }

    const {
      collected,
      errors,
      tasks: dl,
    } = createDownloadTasks(selected, comic.title, url, browser, shouldResume);
    await dl.run();
    if (Object.keys(collected).length > 0) {
      atomicSaveJSON(join(OUTPUT_BASE, slugify(comic.title), "urls.json"), collected);
    }
    reportResults(collected, errors, totalChapters);
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
    "dry-run": {
      type: "boolean",
      description: "预览模式 / Preview without downloading",
      alias: "d",
      default: false,
    },
  },
  async run({ args }) {
    try {
      if (args.url) {
        await runDirect(args.url, args.section, args.chapter, args.resume, args["dry-run"]);
      } else {
        await runInteractive(args.resume, args["dry-run"]);
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
