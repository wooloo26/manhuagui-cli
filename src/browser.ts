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
  if (checkAdult) {
    await checkAdult.click();
    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout: config.adultSelectorTimeout });
      await page.waitForTimeout(config.adultClickSettleDelay);
    }
  }
}
