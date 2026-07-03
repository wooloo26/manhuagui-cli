import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, BrowserContext, Page as PlaywrightPage, Response } from "playwright";
import { createBrowserContext, handleAdultCheck } from "./browser.js";
import { config } from "./config.js";
import { rotateHost } from "./download.js";
import { logger } from "./logger.js";
import { ensureDir, sleep } from "./utils.js";

export function computePadLength(count: number): number {
  return Math.max(config.padMinLength, String(count).length);
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
  const pageUrl = page.url();
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

    if (page.url() !== pageUrl) break;

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

function validateImageResponse(response: Response | null): void {
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

  for (let attempt = 0; attempt < config.retryCount; attempt++) {
    try {
      const response = await dlPage.goto(downloadUrl, {
        referer: chapterUrl,
        waitUntil: "load",
        timeout: config.pageLoadTimeout,
      });
      validateImageResponse(response);
      const base64 = await fetchImageAsBase64(dlPage);
      writeFileSync(filePath, Buffer.from(base64, "base64"));
      return true;
    } catch {
      if (attempt < config.retryCount - 1) {
        downloadUrl = rotateHost(downloadUrl);
        await sleep(config.retryBackoffBase * (attempt + 1));
      }
    }
  }

  logger.warn(`Failed to download after ${config.retryCount} retries: ${url}`);
  return false;
}

async function downloadImages(
  context: BrowserContext,
  chapterUrl: string,
  outputDir: string,
  urls: string[],
  padLen: number,
): Promise<void> {
  const concurrency = Math.min(config.imageConcurrency, urls.length);
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

export async function extractChapterImages(
  chapterUrl: string,
  browser: Browser,
  outputDir: string,
): Promise<string[]> {
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
    await downloadImages(context, chapterUrl, outputDir, urls, padLen);
    return urls;
  } finally {
    await context.close();
  }
}
