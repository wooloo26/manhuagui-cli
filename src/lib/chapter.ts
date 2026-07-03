import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, BrowserContext, Page as PlaywrightPage } from "playwright";
import {
  CHAPTER_SELECTOR_TIMEOUT,
  DOWNLOAD_DELAY,
  IMAGE_CONCURRENCY,
  IMAGE_LOAD_DELAY,
  NEXT_PAGE_TIMEOUT,
  PAD_MIN_LENGTH,
  PAGE_LOAD_TIMEOUT,
  pickUserAgent,
  RETRY_BACKOFF_BASE,
  RETRY_COUNT,
  VIEWPORT_MAX_HEIGHT,
  VIEWPORT_MAX_WIDTH,
  VIEWPORT_MIN_HEIGHT,
  VIEWPORT_MIN_WIDTH,
} from "./config.js";
import { rotateHost } from "./download.js";
import { logger } from "./logger.js";
import { ensureDir, randInt, sleep } from "./utils.js";

export function computePadLength(count: number): number {
  return Math.max(PAD_MIN_LENGTH, String(count).length);
}

export function extractExtension(url: string): string {
  const match = url.match(/\.(\w{3,4})(?:\?|$)/);
  return match?.[1] ?? "webp";
}

export function buildFilePath(
  outputDir: string,
  index: number,
  padLen: number,
  ext: string,
): string {
  const padNum = String(index + 1).padStart(padLen, "0");
  return join(outputDir, `${padNum}.${ext}`);
}

async function getPageCount(page: PlaywrightPage): Promise<number> {
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

async function collectImageUrls(page: PlaywrightPage, pageCount: number): Promise<string[]> {
  const urls: string[] = [];
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
      { timeout: NEXT_PAGE_TIMEOUT },
    );

    await page.waitForTimeout(IMAGE_LOAD_DELAY);
    currentUrl = await page.$eval("#mangaFile", (img) => (img as HTMLImageElement).src);
    urls.push(currentUrl);
  }

  return urls;
}

async function downloadImage(
  dlPage: PlaywrightPage,
  chapterUrl: string,
  url: string,
  outputDir: string,
  imageIndex: number,
  padLen: number,
): Promise<boolean> {
  const ext = extractExtension(url);
  const filePath = buildFilePath(outputDir, imageIndex, padLen, ext);

  let downloadUrl = url;

  for (let attempt = 0; attempt < RETRY_COUNT; attempt++) {
    try {
      const response = await dlPage.goto(downloadUrl, {
        referer: chapterUrl,
        waitUntil: "load",
        timeout: PAGE_LOAD_TIMEOUT,
      });
      if (response?.status() !== 200) {
        throw new Error(`HTTP ${response?.status() ?? "no response"}`);
      }
      const contentType = response?.headers()?.["content-type"] ?? "";
      if (contentType && !contentType.startsWith("image/")) {
        throw new Error(`Unexpected content type: ${contentType}`);
      }
      const base64 = await dlPage.evaluate(async () => {
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
      writeFileSync(filePath, Buffer.from(base64, "base64"));
      return true;
    } catch {
      if (attempt < RETRY_COUNT - 1) {
        downloadUrl = rotateHost(downloadUrl);
        await sleep(RETRY_BACKOFF_BASE * (attempt + 1));
      }
    }
  }

  logger.warn(`Failed to download after ${RETRY_COUNT} retries: ${url}`);
  return false;
}

async function downloadImages(
  context: BrowserContext,
  chapterUrl: string,
  outputDir: string,
  urls: string[],
  padLen: number,
): Promise<void> {
  const concurrency = Math.min(IMAGE_CONCURRENCY, urls.length);
  const downloadPages = await Promise.all(
    Array.from({ length: concurrency }, () => context.newPage()),
  );

  try {
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);

      const results = await Promise.all(
        batch.map((url, idx) =>
          downloadImage(downloadPages[idx], chapterUrl, url, outputDir, i + idx, padLen),
        ),
      );

      if (results.some((r) => !r)) return;

      if (DOWNLOAD_DELAY > 0) {
        await sleep(Math.round(DOWNLOAD_DELAY * (0.5 + Math.random())));
      }
    }
  } finally {
    await Promise.all(downloadPages.map((p) => p.close()));
  }
}

export async function extractChapterImages(
  chapterUrl: string,
  browser: Browser,
  outputDir: string,
): Promise<string[]> {
  ensureDir(outputDir);

  const context = await browser.newContext({
    userAgent: pickUserAgent(),
    viewport: {
      width: randInt(VIEWPORT_MIN_WIDTH, VIEWPORT_MAX_WIDTH),
      height: randInt(VIEWPORT_MIN_HEIGHT, VIEWPORT_MAX_HEIGHT),
    },
  });
  const page = await context.newPage();

  try {
    await page.goto(chapterUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_LOAD_TIMEOUT,
    });

    await page.waitForSelector("#mangaFile", { timeout: CHAPTER_SELECTOR_TIMEOUT });

    const pageCount = await getPageCount(page);
    if (pageCount <= 0) return [];

    const urls = await collectImageUrls(page, pageCount);
    const padLen = computePadLength(urls.length);

    await downloadImages(context, chapterUrl, outputDir, urls, padLen);

    return urls;
  } finally {
    await context.close();
  }
}
