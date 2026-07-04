import { retry } from "es-toolkit";
import type { Browser, BrowserContext, Page } from "playwright";
import { config, pickUserAgent } from "./config.js";
import { randomInt } from "./utils.js";

export async function createBrowserContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: pickUserAgent(),
    viewport: {
      width: randomInt(config.viewportMinWidth, config.viewportMaxWidth),
      height: randomInt(config.viewportMinHeight, config.viewportMaxHeight),
    },
  });
}

export async function handleAdultCheck(page: Page, waitFor?: string): Promise<void> {
  const checkAdult = await page.$("#checkAdult");
  if (!checkAdult) return;

  await page.waitForSelector("#checkAdult", {
    state: "visible",
    timeout: config.adultSelectorTimeout,
  });

  await retry(
    async () => {
      await checkAdult.click();
    },
    {
      retries: 2,
      delay: (_attempt) => config.retryBackoffBase,
    },
  );

  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout: config.adultSelectorTimeout });
    await page.waitForTimeout(config.adultClickSettleDelay);
  }
}
