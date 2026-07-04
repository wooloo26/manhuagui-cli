import { sample } from "es-toolkit";
import { z } from "zod";
import { logger } from "./logger.js";

try {
  process.loadEnvFile?.();
} catch {
  logger.warn("Failed to load .env file");
}

const ConfigSchema = z.object({
  outputBase: z.string(),
  imageConcurrency: z.number().int().positive(),
  downloadDelay: z.number().int().nonnegative(),
  chapterDelayMin: z.number().int().nonnegative(),
  chapterDelayMax: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  retryBackoffBase: z.number().int().nonnegative(),
  imageLoadDelay: z.number().int().nonnegative(),
  logLevel: z.enum(["debug", "info", "warn", "error"]),
  userAgents: z.array(z.string().min(1)).min(1),
  padMinLength: z.number().int().positive(),
  pageLoadTimeout: z.number().int().nonnegative(),
  chapterSelectorTimeout: z.number().int().nonnegative(),
  adultSelectorTimeout: z.number().int().nonnegative(),
  tabLoadTimeout: z.number().int().nonnegative(),
  adultClickSettleDelay: z.number().int().nonnegative(),
  nextPageTimeout: z.number().int().nonnegative(),
  viewportMinWidth: z.number().int().positive(),
  viewportMaxWidth: z.number().int().positive(),
  viewportMinHeight: z.number().int().positive(),
  viewportMaxHeight: z.number().int().positive(),
});

export type Config = z.infer<typeof ConfigSchema>;

export type UserConfigOverrides = Partial<
  Pick<
    Config,
    | "outputBase"
    | "imageConcurrency"
    | "downloadDelay"
    | "chapterDelayMin"
    | "chapterDelayMax"
    | "retryCount"
    | "retryBackoffBase"
    | "imageLoadDelay"
    | "logLevel"
    | "userAgents"
  >
>;

const BUILTIN_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
];

const DEFAULTS: Config = {
  outputBase: "./output",
  imageConcurrency: 2,
  downloadDelay: 3000,
  chapterDelayMin: 3000,
  chapterDelayMax: 6000,
  retryCount: 3,
  retryBackoffBase: 1000,
  imageLoadDelay: 200,
  logLevel: "info",
  userAgents: BUILTIN_USER_AGENTS,
  padMinLength: 3,
  pageLoadTimeout: 30000,
  chapterSelectorTimeout: 30000,
  adultSelectorTimeout: 10000,
  adultClickSettleDelay: 300,
  tabLoadTimeout: 5000,
  nextPageTimeout: 15000,
  viewportMinWidth: 1200,
  viewportMaxWidth: 1600,
  viewportMinHeight: 800,
  viewportMaxHeight: 1000,
};

const LOG_LEVEL_MAP: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 3,
  debug: 4,
};

function loadFromEnv(): UserConfigOverrides {
  const overrides: UserConfigOverrides = {};
  if (process.env.OUTPUT_BASE) overrides.outputBase = process.env.OUTPUT_BASE;
  if (process.env.IMAGE_CONCURRENCY)
    overrides.imageConcurrency = Number(process.env.IMAGE_CONCURRENCY);
  if (process.env.DOWNLOAD_DELAY) overrides.downloadDelay = Number(process.env.DOWNLOAD_DELAY);
  if (process.env.CHAPTER_DELAY_MIN)
    overrides.chapterDelayMin = Number(process.env.CHAPTER_DELAY_MIN);
  if (process.env.CHAPTER_DELAY_MAX)
    overrides.chapterDelayMax = Number(process.env.CHAPTER_DELAY_MAX);
  if (process.env.RETRY_COUNT) overrides.retryCount = Number(process.env.RETRY_COUNT);
  if (process.env.RETRY_BACKOFF_BASE)
    overrides.retryBackoffBase = Number(process.env.RETRY_BACKOFF_BASE);
  if (process.env.IMAGE_LOAD_DELAY) overrides.imageLoadDelay = Number(process.env.IMAGE_LOAD_DELAY);
  if (process.env.LOG_LEVEL) {
    const level = process.env.LOG_LEVEL.toLowerCase();
    if (["debug", "info", "warn", "error"].includes(level))
      overrides.logLevel = level as UserConfigOverrides["logLevel"];
  }
  if (process.env.USER_AGENTS) {
    overrides.userAgents = process.env.USER_AGENTS.split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return overrides;
}

function buildConfig(overrides?: UserConfigOverrides): Config {
  const env = loadFromEnv();
  const merged = { ...DEFAULTS, ...env, ...overrides };
  return ConfigSchema.parse(merged);
}

export let config: Config = buildConfig();

export function initConfig(cliOverrides?: UserConfigOverrides): void {
  config = buildConfig(cliOverrides);
  logger.level = LOG_LEVEL_MAP[config.logLevel] ?? 3;
}

export function pickUserAgent(): string {
  return sample(config.userAgents);
}
