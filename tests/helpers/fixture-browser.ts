import type { Browser, BrowserContext, Page } from "playwright";

export const DUMMY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export interface FixtureEntry {
  urlPattern: string;
  html: string;
}

export interface ErrorRule {
  urlPattern: (url: URL) => boolean;
  status: number;
  contentType?: string;
  body?: string;
  failCount?: number;
}

const requestCount = new Map<string, number>();

export function resetRequestCount(): void {
  requestCount.clear();
}

export async function setupRoutes(
  page: Page,
  fixtures: FixtureEntry[],
  errorRules: ErrorRule[] = [],
): Promise<void> {
  await page.route("**/*", async (route) => {
    const reqUrl = route.request().url();

    for (const rule of errorRules) {
      if (rule.urlPattern(new URL(reqUrl))) {
        const count = (requestCount.get(reqUrl) ?? 0) + 1;
        requestCount.set(reqUrl, count);

        const maxFails = rule.failCount ?? 999;
        if (count <= maxFails) {
          await route.fulfill({
            status: rule.status,
            contentType: rule.contentType ?? "text/plain",
            body: rule.body ?? "",
          });
          return;
        }

        await route.fulfill({
          body: DUMMY_PNG,
          contentType: "image/png",
          status: 200,
        });
        return;
      }
    }

    if (reqUrl.includes("manhuagui.com/comic/")) {
      for (const f of fixtures) {
        if (reqUrl.includes(f.urlPattern)) {
          await route.fulfill({
            body: f.html,
            contentType: "text/html; charset=utf-8",
            status: 200,
          });
          return;
        }
      }
      if (fixtures.length > 0) {
        await route.fulfill({
          body: fixtures[0].html,
          contentType: "text/html; charset=utf-8",
          status: 200,
        });
        return;
      }
    }

    if (/\.(webp|jpg|jpeg|png|gif)(\?|#|$)/i.test(reqUrl)) {
      await route.fulfill({
        body: DUMMY_PNG,
        contentType: "image/png",
        status: 200,
      });
      return;
    }

    await route.abort();
  });
}

export function createMockCreateBrowserContext(
  realBrowser: Browser,
  fixtures: FixtureEntry[],
  errorRules: ErrorRule[] = [],
): (browser: Browser) => Promise<BrowserContext> {
  return async (_browser: Browser) => {
    const ctx = await realBrowser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 test",
      viewport: { width: 1280, height: 900 },
    });

    const origNewPage = ctx.newPage.bind(ctx);
    (ctx as any).newPage = async function () {
      const page = await origNewPage();
      await setupRoutes(page, fixtures, errorRules);
      return page;
    };

    return ctx;
  };
}
