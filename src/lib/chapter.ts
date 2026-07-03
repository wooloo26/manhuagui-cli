import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, BrowserContext, Page as PlaywrightPage, Response } from "playwright";
import { createBrowserContext, handleAdultCheck } from "./browser.js";
import { config } from "./config.js";
import { rotateHost } from "./download.js";
import { logger } from "./logger.js";
import type { SpeedTracker } from "./speed.js";
import { ensureDir, sleep } from "./utils.js";

export function computePadLength(count: number): number {
  return Math.max(config.padMinLength, String(count).length);
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

export async function getSubPageUrls(page: PlaywrightPage): Promise<string[]> {
  try {
    await page.waitForSelector("#pagination a", { timeout: config.tabLoadTimeout });
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

export async function collectImageUrls(page: PlaywrightPage, pageCount: number): Promise<string[]> {
  const urls: string[] = [];
  const pagePath = page.url().split("#")[0];
  let currentUrl = await page.$eval("#mangaFile", (img) => (img as HTMLImageElement).src);
  urls.push(currentUrl);

  for (let i = 1; i < pageCount; i++) {
    const prevUrl = currentUrl;
    const nextBtn = await page.$("#next");
    if (!nextBtn) break;

    await nextBtn.click();
    await page.waitForFunction(
      (prev) => {
        const img = document.querySelector("#mangaFile") as HTMLImageElement | null;
        return img !== null && img.src !== "" && img.src !== prev;
      },
      prevUrl,
      { timeout: config.nextPageTimeout },
    );

    await page.waitForTimeout(config.imageLoadDelay);

    if (page.url().split("#")[0] !== pagePath) break;

    currentUrl = await page.$eval("#mangaFile", (img) => (img as HTMLImageElement).src);
    urls.push(currentUrl);
  }

  return urls;
}

async function navigateToChapterPage(page: PlaywrightPage, url: string): Promise<void> {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: config.pageLoadTimeout,
  });

  await handleAdultCheck(page);
  await page.waitForSelector("#mangaFile", { timeout: config.chapterSelectorTimeout });
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
}

async function downloadImage(opts: {
  dlPage: PlaywrightPage;
  chapterUrl: string;
  url: string;
  outputDir: string;
  imageIndex: number;
  padLen: number;
}): Promise<DownloadResult> {
  const { dlPage, chapterUrl, url, outputDir, imageIndex, padLen } = opts;
  const ext = extractExtension(url);
  const filePath = buildFilePath({ outputDir, index: imageIndex, padLen, ext });

  let downloadUrl = url;

  for (let attempt = 0; attempt < config.retryCount; attempt++) {
    try {
      const started = Date.now();
      const response = await dlPage.goto(downloadUrl, {
        referer: chapterUrl,
        waitUntil: "load",
        timeout: config.pageLoadTimeout,
      });
      validateImageResponse(response);
      const base64 = await fetchImageAsBase64(dlPage);
      const buffer = Buffer.from(base64, "base64");
      writeFileSync(filePath, buffer);
      return { ok: true, bytes: buffer.length, durationMs: Date.now() - started };
    } catch {
      if (attempt < config.retryCount - 1) {
        downloadUrl = rotateHost(downloadUrl);
        await sleep(config.retryBackoffBase * (attempt + 1));
      }
    }
  }

  logger.warn(`Failed to download after ${config.retryCount} retries: ${url}`);
  return { ok: false, bytes: 0, durationMs: 0 };
}

async function downloadImages(opts: {
  context: BrowserContext;
  chapterUrl: string;
  outputDir: string;
  urls: string[];
  padLen: number;
  tracker: SpeedTracker;
}): Promise<void> {
  const { context, chapterUrl, outputDir, urls, padLen, tracker } = opts;
  const concurrency = Math.min(config.imageConcurrency, urls.length);
  const downloadPages = await Promise.all(
    Array.from({ length: concurrency }, () => context.newPage()),
  );

  try {
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);

      const results = await Promise.all(
        batch.map((url, idx) =>
          downloadImage({
            dlPage: downloadPages[idx],
            chapterUrl,
            url,
            outputDir,
            imageIndex: i + idx,
            padLen,
          }),
        ),
      );

      for (const r of results) {
        if (r.ok) {
          tracker.record(r.bytes, r.durationMs);
        }
      }

      if (results.some((r) => !r.ok)) return;

      if (config.downloadDelay > 0) {
        await sleep(Math.round(config.downloadDelay * (0.5 + Math.random())));
      }
    }
  } finally {
    await Promise.all(downloadPages.map((p) => p.close()));
  }
}

async function collectImageUrlsFromSubPages(
  page: PlaywrightPage,
  subPageUrls: string[],
): Promise<string[]> {
  const allUrls: string[] = [];
  for (let i = 0; i < subPageUrls.length; i++) {
    if (i > 0) {
      await navigateToChapterPage(page, subPageUrls[i]);
    }

    const tabPageCount = await getPageCount(page);
    if (tabPageCount <= 0) continue;

    const tabUrls = await collectImageUrls(page, tabPageCount);
    allUrls.push(...tabUrls);
  }
  return allUrls;
}

export async function extractChapterImages(opts: {
  chapterUrl: string;
  browser: Browser;
  outputDir: string;
  tracker: SpeedTracker;
}): Promise<string[]> {
  const { chapterUrl, browser, outputDir, tracker } = opts;
  ensureDir(outputDir);

  const context = await createBrowserContext(browser);
  const page = await context.newPage();

  try {
    await navigateToChapterPage(page, chapterUrl);

    const subPageUrls = await getSubPageUrls(page);

    let urls: string[];
    if (subPageUrls.length > 0) {
      urls = await collectImageUrlsFromSubPages(page, subPageUrls);
    } else {
      const pageCount = await getPageCount(page);
      if (pageCount <= 0) return [];
      urls = await collectImageUrls(page, pageCount);
    }

    if (urls.length === 0) return [];

    const padLen = computePadLength(urls.length);
    await downloadImages({ context, chapterUrl, outputDir, urls, padLen, tracker });
    return urls;
  } finally {
    await context.close();
  }
}
