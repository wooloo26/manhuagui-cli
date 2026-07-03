import { logger } from "./logger.js";

try {
  process.loadEnvFile?.();
} catch {
  logger.warn("Failed to load .env file");
}

export const OUTPUT_BASE = process.env.OUTPUT_BASE || "./output";

export const IMAGE_CONCURRENCY = Number(process.env.IMAGE_CONCURRENCY) || 2;

export const DOWNLOAD_DELAY = Number(process.env.DOWNLOAD_DELAY) || 3000;

export const CHAPTER_DELAY_MIN = Number(process.env.CHAPTER_DELAY_MIN) || 5000;
export const CHAPTER_DELAY_MAX = Number(process.env.CHAPTER_DELAY_MAX) || 15000;

export const RETRY_COUNT = Number(process.env.RETRY_COUNT) || 3;
export const RETRY_BACKOFF_BASE = Number(process.env.RETRY_BACKOFF_BASE) || 1000;
export const IMAGE_LOAD_DELAY = Number(process.env.IMAGE_LOAD_DELAY) || 200;
export const PAD_MIN_LENGTH = 3;

export const PAGE_LOAD_TIMEOUT = 30000;
export const CHAPTER_SELECTOR_TIMEOUT = 30000;
export const ADULT_SELECTOR_TIMEOUT = 10000;
export const ADULT_CLICK_SETTLE_DELAY = 300;
export const NEXT_PAGE_TIMEOUT = 15000;

const _AGENTS_RAW = process.env.USER_AGENTS;
export const USER_AGENTS = _AGENTS_RAW
  ? _AGENTS_RAW
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
  : [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    ];

export function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export const VIEWPORT_MIN_WIDTH = 1200;
export const VIEWPORT_MAX_WIDTH = 1600;
export const VIEWPORT_MIN_HEIGHT = 800;
export const VIEWPORT_MAX_HEIGHT = 1000;
