import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chunk, retry } from "es-toolkit";
import type { BrowserContext, Page as PlaywrightPage, Response } from "playwright";
import type { Config } from "./config.js";
import { logger } from "./logger.js";
import type { SpeedTracker } from "./speed.js";
import { sleep } from "./utils.js";

const DEFAULT_CDN_HOSTS = Object.freeze(["eu", "eu1", "eu2", "us", "us1", "us2", "us3"]);

const CDN_HOSTS: readonly string[] = (() => {
  const env = process.env.CDN_HOSTS;
  if (env) {
    const hosts = env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (hosts.length > 0) return Object.freeze(hosts);
  }
  return DEFAULT_CDN_HOSTS;
})();

export function rotateHost(url: string): string {
  const parsed = new URL(url);
  const parts = parsed.hostname.split(".");
  if (parts.length >= 3) {
    const idx = CDN_HOSTS.indexOf(parts[0]);
    if (idx !== -1) {
      parts[0] = CDN_HOSTS[(idx + 1) % CDN_HOSTS.length];
      parsed.hostname = parts.join(".");
    }
  }
  return parsed.href;
}

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
  cfg: Config;
}): Promise<DownloadResult> {
  const { dlPage, chapterUrl, url, outputDir, imageIndex, padLen, cfg } = opts;
  const filePath = buildFilePath({
    outputDir,
    index: imageIndex,
    padLen,
    ext: extractExtension(url),
  });

  let downloadUrl = url;

  try {
    const result = await retry(
      async () => {
        const started = Date.now();
        const response = await dlPage.goto(downloadUrl, {
          referer: chapterUrl,
          waitUntil: "load",
          timeout: cfg.pageLoadTimeout,
        });
        validateImageResponse(response);
        const base64 = await fetchImageAsBase64(dlPage);
        const buffer = Buffer.from(base64, "base64");
        writeFileSync(filePath, buffer);
        return { ok: true as const, bytes: buffer.length, durationMs: Date.now() - started };
      },
      {
        retries: cfg.retryCount - 1,
        delay: (attempt) => {
          downloadUrl = rotateHost(downloadUrl);
          return cfg.retryBackoffBase * (attempt + 1);
        },
      },
    );
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to download after ${cfg.retryCount} retries: ${url} (${reason})`);
    return { ok: false, bytes: 0, durationMs: 0 };
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
            dlPage: downloadPages[idx],
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

      if (results.some((r) => !r.ok)) return;
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
