import { retry } from "es-toolkit";
import type { Browser, BrowserContext, Page } from "playwright";
import { type Config, config as defaultConfig, pickUserAgent } from "./config.js";
import { randomInt } from "./utils.js";

export async function createBrowserContext(
  browser: Browser,
  cfg: Config = defaultConfig,
): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: pickUserAgent(cfg),
    viewport: {
      width: randomInt(cfg.viewportMinWidth, cfg.viewportMaxWidth),
      height: randomInt(cfg.viewportMinHeight, cfg.viewportMaxHeight),
    },
  });
}

export async function handleAdultCheck(
  page: Page,
  cfg: Config = defaultConfig,
  waitFor?: string,
): Promise<void> {
  const checkAdult = await page.$("#checkAdult");
  if (!checkAdult) return;

  await page.waitForSelector("#checkAdult", {
    state: "visible",
    timeout: cfg.adultSelectorTimeout,
  });

  await retry(
    async () => {
      await checkAdult.click();
    },
    {
      retries: 2,
      delay: (_attempt) => cfg.retryBackoffBase,
    },
  ).catch(() => {
    throw new Error("Failed to dismiss adult check after retries");
  });

  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout: cfg.adultSelectorTimeout });
    await page.waitForTimeout(cfg.adultClickSettleDelay);
  }
}
