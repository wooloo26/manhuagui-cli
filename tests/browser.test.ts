import type { Browser, BrowserContext, Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { createBrowserContext, handleAdultCheck } from "../src/browser.js";

function mockBrowser(): Browser {
  return {
    newContext: vi.fn().mockResolvedValue({} as BrowserContext),
  } as unknown as Browser;
}

function mockPage(options: { hasCheckAdult?: boolean; clickThrows?: boolean } = {}): Page {
  const $spy = vi.fn();
  if (options.hasCheckAdult ?? true) {
    if (options.clickThrows) {
      $spy.mockRejectedValue(new Error("click failed"));
    } else {
      $spy.mockResolvedValue({ click: vi.fn().mockResolvedValue(undefined) });
    }
  } else {
    $spy.mockResolvedValue(null);
  }

  return {
    $: $spy,
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
}

describe("createBrowserContext", () => {
  it("calls browser.newContext with userAgent and viewport", async () => {
    const browser = mockBrowser();
    await createBrowserContext(browser);
    expect(browser.newContext).toHaveBeenCalledTimes(1);

    const args = (browser.newContext as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args).toHaveProperty("userAgent");
    expect(args).toHaveProperty("viewport");
    expect(typeof args.userAgent).toBe("string");
    expect(typeof args.viewport.width).toBe("number");
    expect(typeof args.viewport.height).toBe("number");
  });

  it("viewport dimensions are within configured range", async () => {
    const browser = mockBrowser();
    await createBrowserContext(browser);
    const args = (browser.newContext as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.viewport.width).toBeGreaterThanOrEqual(1200);
    expect(args.viewport.width).toBeLessThanOrEqual(1600);
    expect(args.viewport.height).toBeGreaterThanOrEqual(800);
    expect(args.viewport.height).toBeLessThanOrEqual(1000);
  });
});

describe("handleAdultCheck", () => {
  it("clicks #checkAdult when present on page", async () => {
    const page = mockPage({ hasCheckAdult: true });
    await handleAdultCheck(page);

    expect(page.$).toHaveBeenCalledWith("#checkAdult");
  });

  it("does nothing when #checkAdult is not present", async () => {
    const page = mockPage({ hasCheckAdult: false });
    await handleAdultCheck(page);

    expect(page.$).toHaveBeenCalledWith("#checkAdult");
    expect(page.waitForSelector).not.toHaveBeenCalled();
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });

  it("waits for selector when waitFor is provided", async () => {
    const page = mockPage({ hasCheckAdult: true });
    await handleAdultCheck(page, undefined, ".mangaFile");

    expect(page.waitForSelector).toHaveBeenCalledWith(".mangaFile", expect.any(Object));
    expect(page.waitForTimeout).toHaveBeenCalled();
  });

  it("waits for #checkAdult visibility when button is present", async () => {
    const page = mockPage({ hasCheckAdult: true });
    await handleAdultCheck(page);

    expect(page.waitForSelector).toHaveBeenCalledWith("#checkAdult", expect.any(Object));
  });

  it("does not wait when waitFor is not provided (aside from visibility check)", async () => {
    const page = mockPage({ hasCheckAdult: true });
    await handleAdultCheck(page);

    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });

  it("does not wait even when waitFor is provided but #checkAdult is absent", async () => {
    const page = mockPage({ hasCheckAdult: false });
    await handleAdultCheck(page, undefined, ".selector");

    expect(page.waitForSelector).not.toHaveBeenCalled();
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });
});
