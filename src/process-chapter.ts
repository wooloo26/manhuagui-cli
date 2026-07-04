import { join } from "node:path";
import type { Browser } from "playwright";
import { createBrowserContext } from "./browser.js";
import { collectChapterUrls, computePadLength } from "./chapter.js";
import type { Config } from "./config.js";
import { clearChapterDir, downloadImages } from "./download.js";
import { logger } from "./logger.js";
import type { SpeedTracker } from "./speed.js";
import type { Chapter } from "./types.js";
import { ensureDir, slugify } from "./utils.js";

export async function processChapter(opts: {
  chapter: Chapter;
  sectionName: string;
  comicTitle: string;
  browser: Browser;
  tracker: SpeedTracker;
  cfg: Config;
  overwrite: boolean;
  storedUrlsHash?: string;
  onHash?: (hash: string) => void;
  onProgress?: (downloaded: number, total: number, bytes: number) => void;
}): Promise<{ title: string; urls: string[]; urlsHash: string; chapterUrl: string } | null> {
  const {
    chapter,
    sectionName,
    comicTitle,
    browser,
    tracker,
    cfg,
    overwrite,
    storedUrlsHash,
    onHash,
    onProgress,
  } = opts;
  const dirName = slugify(chapter.title);
  const outputDir = join(cfg.outputBase, slugify(comicTitle), slugify(sectionName), dirName);
  ensureDir(outputDir);

  const context = await createBrowserContext(browser, cfg);
  const page = await context.newPage();
  try {
    const urlsResult = await collectChapterUrls({
      page,
      chapterUrl: chapter.url,
      cfg,
      onProgress,
    });
    if (!urlsResult) return null;
    const { urls, urlsHash } = urlsResult;
    onHash?.(urlsHash);

    if (overwrite || (storedUrlsHash !== undefined && storedUrlsHash !== urlsHash)) {
      logger.debug(
        storedUrlsHash !== undefined && storedUrlsHash !== urlsHash
          ? "CDN URLs changed, clearing chapter directory"
          : "Overwrite enabled, clearing unfinished chapter directory",
      );
      clearChapterDir(outputDir);
    }

    const padLen = computePadLength(urls.length, cfg);
    const actualCount = urls.length;
    onProgress?.(0, actualCount, 0);
    await downloadImages({
      context,
      chapterUrl: chapter.url,
      outputDir,
      urls,
      padLen,
      tracker,
      cfg,
      onProgress: (downloaded, bytes) => onProgress?.(downloaded, actualCount, bytes),
    });
    return {
      title: chapter.title,
      urls,
      urlsHash,
      chapterUrl: chapter.url,
    };
  } finally {
    await context.close();
  }
}
