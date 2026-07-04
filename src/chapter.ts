import { retry } from "es-toolkit";
import type { Browser, Page as PlaywrightPage } from "playwright";
import { createBrowserContext, handleAdultCheck } from "./browser.js";
import { type Config, config as defaultConfig } from "./config.js";
import { clearChapterDir, computePadLength, downloadImages } from "./download.js";
import { logger } from "./logger.js";
import type { SpeedTracker } from "./speed.js";
import { ensureDir, hashUrls } from "./utils.js";

export {
  buildFilePath,
  computePadLength,
  extractExtension,
  validateImageResponse,
} from "./download.js";

export async function getPageCount(page: PlaywrightPage): Promise<number> {
  return page.evaluate(() => {
    const pageSpan = document.querySelector("#page");
    if (pageSpan?.parentElement) {
      const match = pageSpan.parentElement.textContent?.match(/\/(\d+)/);
      if (match) return parseInt(match[1], 10);
    }

    const select = document.querySelector("#pageSelect") as HTMLSelectElement | null;
    if (select?.options.length) return select.options.length;

    return 0;
  });
}

export async function getSubPageUrls(
  page: PlaywrightPage,
  cfg: Config = defaultConfig,
): Promise<string[]> {
  try {
    await page.waitForSelector("#pagination a", { timeout: cfg.tabLoadTimeout });
    return await page.evaluate(() => {
      const links = document.querySelectorAll("#pagination a");
      if (links.length <= 1) return [];
      return Array.from(links)
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => href.startsWith("http"));
    });
  } catch {
    return [];
  }
}

export async function collectImageUrls(
  page: PlaywrightPage,
  pageCount: number,
  cfg: Config = defaultConfig,
): Promise<string[]> {
  const urls: string[] = [];
  const pagePath = page.url().split("#")[0];
  let currentUrl = await page.$eval("#mangaFile", (img) => (img as HTMLImageElement).src);
  urls.push(currentUrl);

  for (let i = 1; i < pageCount; i++) {
    const prevUrl = currentUrl;
    try {
      await page.waitForSelector("#next", {
        state: "visible",
        timeout: cfg.nextBtnTimeout,
      });
    } catch {
      break;
    }

    await retry(
      async () => {
        await page.locator("#next").click();
      },
      {
        retries: 2,
        delay: (_attempt) => cfg.retryBackoffBase,
      },
    );
    await page.waitForFunction(
      (prev) => {
        const img = document.querySelector("#mangaFile") as HTMLImageElement | null;
        return img !== null && img.src !== "" && img.src !== prev;
      },
      prevUrl,
      { timeout: cfg.nextPageTimeout },
    );

    await page.waitForTimeout(cfg.imageLoadDelay);

    if (page.url().split("#")[0] !== pagePath) break;

    currentUrl = await page.$eval("#mangaFile", (img) => (img as HTMLImageElement).src);
    urls.push(currentUrl);
  }

  return urls;
}

async function navigateToChapterPage(
  page: PlaywrightPage,
  url: string,
  cfg: Config = defaultConfig,
): Promise<void> {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: cfg.pageLoadTimeout,
  });

  await handleAdultCheck(page, cfg);
  await page.waitForSelector("#mangaFile", { timeout: cfg.chapterSelectorTimeout });
}

async function collectImageUrlsFromSubPages(
  page: PlaywrightPage,
  subPageUrls: string[],
  cfg: Config,
): Promise<string[]> {
  const allUrls: string[] = [];
  for (let i = 0; i < subPageUrls.length; i++) {
    if (i > 0) {
      await navigateToChapterPage(page, subPageUrls[i], cfg);
    }

    const tabPageCount = await getPageCount(page);
    if (tabPageCount <= 0) continue;

    const tabUrls = await collectImageUrls(page, tabPageCount, cfg);
    allUrls.push(...tabUrls);
  }
  return allUrls;
}

async function resolveChapterUrls(
  page: PlaywrightPage,
  cfg: Config,
  onProgress?: (downloaded: number, total: number, bytes: number) => void,
): Promise<string[] | null> {
  const subPageUrls = await getSubPageUrls(page, cfg);

  if (subPageUrls.length > 0) {
    return collectImageUrlsFromSubPages(page, subPageUrls, cfg);
  }

  const expectedCount = await getPageCount(page);
  if (expectedCount <= 0) return null;
  onProgress?.(0, expectedCount, 0);
  return collectImageUrls(page, expectedCount, cfg);
}

export async function extractChapterImages(opts: {
  chapterUrl: string;
  browser: Browser;
  outputDir: string;
  tracker: SpeedTracker;
  cfg?: Config;
  storedUrlsHash?: string;
  overwrite?: boolean;
  onHash?: (hash: string) => void;
  onProgress?: (downloaded: number, total: number, bytes: number) => void;
}): Promise<{ urls: string[]; urlsHash: string } | null> {
  const {
    chapterUrl,
    browser,
    outputDir,
    tracker,
    cfg = defaultConfig,
    storedUrlsHash,
    overwrite,
    onHash,
    onProgress,
  } = opts;
  ensureDir(outputDir);

  const context = await createBrowserContext(browser, cfg);
  const page = await context.newPage();

  try {
    await navigateToChapterPage(page, chapterUrl, cfg);

    const urls = await resolveChapterUrls(page, cfg, onProgress);
    if (!urls || urls.length === 0) return null;

    const urlsHash = hashUrls(urls);
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
      chapterUrl,
      outputDir,
      urls,
      padLen,
      tracker,
      cfg,
      onProgress: (downloaded, bytes) => onProgress?.(downloaded, actualCount, bytes),
    });
    return { urls, urlsHash };
  } finally {
    await context.close();
  }
}
