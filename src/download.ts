import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chunk, retry } from "es-toolkit";
import type { Browser, BrowserContext, Page as PlaywrightPage, Response } from "playwright";
import { createBrowserContext, handleAdultCheck } from "./comic.js";
import { type Config, config as defaultConfig } from "./config.js";
import { logger } from "./logger.js";
import type { Chapter } from "./types.js";
import type { SpeedTracker } from "./ui.js";
import { ensureDir, sleep, slugify } from "./utils.js";

// ===== File path helpers =====

export function computePadLength(count: number, cfg?: Config): number {
  const padMinLength = cfg?.padMinLength ?? 3;
  return Math.max(padMinLength, String(count).length);
}

export function extractExtension(url: string): string {
  const match = url.match(/\.(\w{3,4})(?:\?|$)/);
  return match?.[1] ?? "webp";
}

export function buildFilePath(opts: {
  outputDir: string;
  index: number;
  padLen: number;
  ext: string;
}): string {
  const padNum = String(opts.index + 1).padStart(opts.padLen, "0");
  return join(opts.outputDir, `${padNum}.${opts.ext}`);
}

export function validateImageResponse(response: Response | null): void {
  if (response?.status() !== 200) {
    throw new Error(`HTTP ${response?.status() ?? "no response"}`);
  }
  const contentType = response?.headers()?.["content-type"] ?? "";
  if (contentType && !contentType.startsWith("image/")) {
    throw new Error(`Unexpected content type: ${contentType}`);
  }
}

// ===== Image download =====

async function fetchImageAsBase64(page: PlaywrightPage): Promise<string> {
  return page.evaluate(async () => {
    const res = await fetch(window.location.href);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const step = 0x8000;
    for (let j = 0; j < bytes.length; j += step) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + step)));
    }
    return btoa(binary);
  });
}

interface DownloadResult {
  ok: boolean;
  bytes: number;
  durationMs: number;
  error?: string;
}

async function downloadImage(opts: {
  downloadPage: PlaywrightPage;
  chapterUrl: string;
  url: string;
  outputDir: string;
  imageIndex: number;
  padLen: number;
  cfg: Config;
}): Promise<DownloadResult> {
  const { downloadPage, chapterUrl, url, outputDir, imageIndex, padLen, cfg } = opts;
  const filePath = buildFilePath({
    outputDir,
    index: imageIndex,
    padLen,
    ext: extractExtension(url),
  });

  try {
    const result = await retry(
      async () => {
        const started = Date.now();
        const response = await downloadPage.goto(url, {
          referer: chapterUrl,
          waitUntil: "load",
          timeout: cfg.pageLoadTimeout,
        });
        validateImageResponse(response);
        const base64 = await fetchImageAsBase64(downloadPage);
        const buffer = Buffer.from(base64, "base64");
        writeFileSync(filePath, buffer);
        return { ok: true as const, bytes: buffer.length, durationMs: Date.now() - started };
      },
      {
        retries: cfg.retryCount,
        delay: (attempt) => cfg.retryBackoffBase * (attempt + 1),
      },
    );
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      bytes: 0,
      durationMs: 0,
      error: `Failed to download after ${cfg.retryCount} retries: ${url} (${reason})`,
    };
  }
}

function isImageDownloaded(filePath: string): boolean {
  return existsSync(filePath) && statSync(filePath).size > 0;
}

export function clearChapterDir(outputDir: string): void {
  try {
    for (const f of readdirSync(outputDir)) {
      rmSync(join(outputDir, f), { force: true });
    }
  } catch {
    // directory may not exist yet
  }
}

export async function downloadImages(opts: {
  context: BrowserContext;
  chapterUrl: string;
  outputDir: string;
  urls: string[];
  padLen: number;
  tracker: SpeedTracker;
  cfg: Config;
  onProgress?: (downloaded: number, bytes: number) => void;
}): Promise<void> {
  const { context, chapterUrl, outputDir, urls, padLen, tracker, cfg, onProgress } = opts;
  const concurrency = Math.min(cfg.imageConcurrency, urls.length);
  const downloadPages = await Promise.all(
    Array.from({ length: concurrency }, () => context.newPage()),
  );

  try {
    let completed = 0;
    for (const batch of chunk(urls, concurrency)) {
      const results = await Promise.all(
        batch.map(async (url, idx) => {
          const imageIndex = completed + idx;
          const filePath = buildFilePath({
            outputDir,
            index: imageIndex,
            padLen,
            ext: extractExtension(url),
          });

          if (isImageDownloaded(filePath)) {
            return { ok: true, bytes: 0, durationMs: 0 };
          }

          return downloadImage({
            downloadPage: downloadPages[idx],
            chapterUrl,
            url,
            outputDir,
            imageIndex,
            padLen,
            cfg,
          });
        }),
      );

      let batchBytes = 0;
      for (const r of results) {
        if (r.ok) {
          tracker.record(r.bytes, r.durationMs);
          batchBytes += r.bytes;
        }
      }

      completed += batch.length;

      if (results.some((r) => !r.ok)) {
        const failed = results.filter(
          (r): r is DownloadResult & { ok: false; error: string } => !r.ok && r.error !== undefined,
        );
        throw new Error(
          failed.length > 0
            ? failed.map((r) => r.error).join("; ")
            : "Image download failed after all retries",
        );
      }
      onProgress?.(Math.min(completed, urls.length), batchBytes);

      const isLast = completed >= urls.length;
      if (!isLast && cfg.downloadDelay > 0 && batchBytes > 0) {
        await sleep(Math.round(cfg.downloadDelay * (0.5 + Math.random())));
      }
    }
  } finally {
    await Promise.all(downloadPages.map((p) => p.close()));
  }
}

// ===== Chapter URL collection =====

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
        retries: cfg.retryCount,
        delay: () => cfg.retryBackoffBase,
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

export async function collectChapterUrls(opts: {
  page: PlaywrightPage;
  chapterUrl: string;
  cfg?: Config;
  onProgress?: (downloaded: number, total: number, bytes: number) => void;
}): Promise<{ urls: string[] } | null> {
  const { page, chapterUrl, cfg = defaultConfig, onProgress } = opts;
  await navigateToChapterPage(page, chapterUrl, cfg);
  const urls = await resolveChapterUrls(page, cfg, onProgress);
  if (!urls || urls.length === 0) return null;
  return { urls };
}

// ===== Chapter processing =====

export async function processChapter(opts: {
  chapter: Chapter;
  sectionName: string;
  comicTitle: string;
  browser: Browser;
  tracker: SpeedTracker;
  cfg: Config;
  overwrite: boolean;
  onProgress?: (downloaded: number, total: number, bytes: number) => void;
}): Promise<{ title: string; urls: string[]; chapterUrl: string } | null> {
  const { chapter, sectionName, comicTitle, browser, tracker, cfg, overwrite, onProgress } = opts;
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
    const { urls } = urlsResult;

    if (overwrite) {
      logger.debug("Overwrite enabled, clearing unfinished chapter directory");
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
      chapterUrl: chapter.url,
    };
  } finally {
    await context.close();
  }
}
