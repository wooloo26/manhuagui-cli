import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { config, initConfig } from "../../src/config.js";
import { SpeedTracker } from "../../src/ui.js";
import { processChapter } from "../../src/download.js";
import { slugify } from "../../src/utils.js";
import {
  createMockCreateBrowserContext,
  resetRequestCount,
  type FixtureEntry,
} from "../helpers/fixture-browser.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp-dir.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

const chapterSingleHtml = loadFixture("chapter-single.html");
const chapterMultiP1Html = loadFixture("chapter-multi-p1.html");
const chapterMultiP2Html = loadFixture("chapter-multi-p2.html");
const chapterAdultHtml = loadFixture("chapter-adult.html");

const { mockCreateBrowserContext, mockHandleAdultCheck } = vi.hoisted(() => ({
  mockCreateBrowserContext: vi.fn(),
  mockHandleAdultCheck: vi.fn(),
}));

vi.mock("../../src/comic.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/comic.js")>();
  return {
    ...actual,
    createBrowserContext: mockCreateBrowserContext,
    handleAdultCheck: mockHandleAdultCheck,
  };
});

describe("processChapter integration", () => {
  let browser: Browser;
  let tmpDir: string;

  const sectionName = "Test";
  const comicTitle = "TestComic";

  function outputDir(dirName: string): string {
    return join(tmpDir, slugify(comicTitle), slugify(sectionName), slugify(dirName));
  }

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    initConfig({
      chapterDelayMin: 0,
      chapterDelayMax: 0,
      downloadDelay: 0,
      retryCount: 3,
      retryBackoffBase: 1,
      imageLoadDelay: 0,
    });
    config.pageLoadTimeout = 10000;
    config.nextPageTimeout = 5000;
    config.chapterSelectorTimeout = 5000;
    config.tabLoadTimeout = 5000;
    config.adultSelectorTimeout = 5000;
    config.adultClickSettleDelay = 0;
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(() => {
    tmpDir = createTempDir();
    config.outputBase = tmpDir;
    vi.clearAllMocks();
    resetRequestCount();
    mockCreateBrowserContext.mockReset();
    mockHandleAdultCheck.mockReset();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  function setupMock(fixtures: FixtureEntry[]) {
    mockCreateBrowserContext.mockImplementation(
      createMockCreateBrowserContext(browser, fixtures),
    );
  }

  function defaultFixture(fixtureUrl: string, html: string) {
    return [{ urlPattern: fixtureUrl, html }];
  }

  it("process images from a single-page chapter", async () => {
    const fixtureUrl = "12345.html";
    setupMock(defaultFixture(fixtureUrl, chapterSingleHtml));

    const chapterUrl = `https://www.manhuagui.com/comic/7580/${fixtureUrl}`;
    const tracker = new SpeedTracker();

    const result = await processChapter({
      chapter: { title: "single-chapter", url: chapterUrl, pageCount: 10 },
      sectionName,
      comicTitle,
      browser,
      tracker,
      cfg: config,
      overwrite: false,
    });

    expect(result).not.toBeNull();
    expect(result!.urls).toHaveLength(10);
    expect(result!.urlsHash).toBeTruthy();
    expect(result!.urlsHash).toHaveLength(16);

    const outDir = outputDir("single-chapter");
    const files = readdirSync(outDir);
    expect(files).toHaveLength(10);
    for (const file of files) {
      const stat = statSync(join(outDir, file));
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it("process images from a multi-tab chapter", async () => {
    const p1Url = "multi.html";
    const p2Url = "multi_p2.html";
    setupMock([
      { urlPattern: p1Url, html: chapterMultiP1Html },
      { urlPattern: p2Url, html: chapterMultiP2Html },
    ]);

    const chapterUrl = `https://www.manhuagui.com/comic/7580/${p1Url}`;
    const tracker = new SpeedTracker();

    const result = await processChapter({
      chapter: { title: "multi-chapter", url: chapterUrl, pageCount: 10 },
      sectionName,
      comicTitle,
      browser,
      tracker,
      cfg: config,
      overwrite: false,
    });

    expect(result).not.toBeNull();
    expect(result!.urls).toHaveLength(10);
    expect(result!.urlsHash).toHaveLength(16);

    const outDir = outputDir("multi-chapter");
    const files = readdirSync(outDir);
    expect(files).toHaveLength(10);
  });

  it("handles the adult check gate", async () => {
    const fixtureUrl = "adult.html";
    setupMock(defaultFixture(fixtureUrl, chapterAdultHtml));

    mockHandleAdultCheck.mockImplementation(async (page: any, _waitFor?: string) => {
      const checkAdult = await page.$("#checkAdult");
      if (checkAdult) {
        await checkAdult.click();
        await page.waitForSelector("#mangaFile", { timeout: 5000 });
      }
    });

    const chapterUrl = `https://www.manhuagui.com/comic/4736/${fixtureUrl}`;
    const tracker = new SpeedTracker();

    const result = await processChapter({
      chapter: { title: "adult-chapter", url: chapterUrl, pageCount: 10 },
      sectionName,
      comicTitle,
      browser,
      tracker,
      cfg: config,
      overwrite: false,
    });

    expect(result).not.toBeNull();
    expect(result!.urls).toHaveLength(5);
    expect(mockHandleAdultCheck).toHaveBeenCalled();
  });

  it("returns null when chapter has zero page count", async () => {
    const zeroPageHtml = chapterSingleHtml.replace(/>1<\/span>\/10/, ">0</span>/0");
    const fixtureUrl = "empty.html";
    setupMock(defaultFixture(fixtureUrl, zeroPageHtml));

    const chapterUrl = `https://www.manhuagui.com/comic/7580/${fixtureUrl}`;
    const tracker = new SpeedTracker();

    const result = await processChapter({
      chapter: { title: "empty-chapter", url: chapterUrl, pageCount: 0 },
      sectionName,
      comicTitle,
      browser,
      tracker,
      cfg: config,
      overwrite: false,
    });

    expect(result).toBeNull();
  });

  it("skips redownload when storedUrlsHash matches", async () => {
    const fixtureUrl = "skip.html";
    setupMock(defaultFixture(fixtureUrl, chapterSingleHtml));

    const chapterUrl = `https://www.manhuagui.com/comic/7580/${fixtureUrl}`;
    const tracker = new SpeedTracker();

    const chapter = { title: "skip-chapter", url: chapterUrl, pageCount: 10 };

    // First run — downloads all images
    const result1 = await processChapter({
      chapter,
      sectionName,
      comicTitle,
      browser,
      tracker,
      cfg: config,
      overwrite: false,
    });

    expect(result1).not.toBeNull();
    const firstHash = result1!.urlsHash;

    const outDir = outputDir("skip-chapter");

    // Capture modification times after first download
    const firstMtimes = new Map(
      readdirSync(outDir).map((f) => [f, statSync(join(outDir, f)).mtimeMs]),
    );

    // Second run — hash matches, should keep existing files
    const result2 = await processChapter({
      chapter,
      sectionName,
      comicTitle,
      browser,
      tracker,
      cfg: config,
      overwrite: false,
      storedUrlsHash: firstHash,
    });

    expect(result2).not.toBeNull();
    expect(result2!.urlsHash).toBe(firstHash);

    // Files should still exist with same modification times
    const secondMtimes = new Map(
      readdirSync(outDir).map((f) => [f, statSync(join(outDir, f)).mtimeMs]),
    );
    for (const [file, mtime] of firstMtimes) {
      expect(secondMtimes.get(file)).toBe(mtime);
    }
  });

  it("clears directory and redownloads when CDN hash changed", async () => {
    const fixtureUrl = "cdn-change.html";
    setupMock([
      { urlPattern: fixtureUrl, html: chapterSingleHtml },
      {
        urlPattern: "different.html",
        html: chapterSingleHtml.replace(
          /img\/test\/0/g,
          "img/test/new-0",
        ),
      },
    ]);

    const chapterUrl = `https://www.manhuagui.com/comic/7580/${fixtureUrl}`;
    const tracker = new SpeedTracker();

    const chapter = { title: "cdn-chapter", url: chapterUrl, pageCount: 10 };

    // First run
    const result1 = await processChapter({
      chapter,
      sectionName,
      comicTitle,
      browser,
      tracker,
      cfg: config,
      overwrite: false,
    });
    expect(result1).not.toBeNull();
    const outDir = outputDir("cdn-chapter");
    const firstFiles = readdirSync(outDir);
    expect(firstFiles.length).toBeGreaterThan(0);

    // Second run — different fixture produces different hash
    const chapter2 = { title: "cdn-chapter", url: `https://www.manhuagui.com/comic/7580/different.html`, pageCount: 10 };
    const result2 = await processChapter({
      chapter: chapter2,
      sectionName,
      comicTitle,
      browser,
      tracker,
      cfg: config,
      overwrite: false,
      storedUrlsHash: result1!.urlsHash,
    });

    expect(result2).not.toBeNull();
    expect(result2!.urlsHash).not.toBe(result1!.urlsHash);

    // Files should have been cleared and recreated
    const secondFiles = readdirSync(outDir);
    expect(secondFiles.length).toBeGreaterThan(0);
  });

  it("retries failed image downloads with CDN rotation", async () => {
    const failFixture = chapterSingleHtml.replace(
      /eu\.manhuagui\.com\/img\/test\//g,
      "eu.manhuagui.com/img/fail-once/",
    );
    const fixtureUrl = "retry.html";

    const mockCtx = createMockCreateBrowserContext(
      browser,
      [{ urlPattern: fixtureUrl, html: failFixture }],
      [
        {
          urlPattern: (url: URL) => url.href.includes("img/fail-once/"),
          status: 404,
          failCount: 1,
        },
      ],
    );
    mockCreateBrowserContext.mockImplementation(mockCtx);

    const chapterUrl = `https://www.manhuagui.com/comic/7580/${fixtureUrl}`;
    const tracker = new SpeedTracker();

    const result = await processChapter({
      chapter: { title: "retry-chapter", url: chapterUrl, pageCount: 10 },
      sectionName,
      comicTitle,
      browser,
      tracker,
      cfg: config,
      overwrite: false,
    });

    expect(result).not.toBeNull();
    expect(result!.urls).toHaveLength(10);

    const outDir = outputDir("retry-chapter");
    const files = readdirSync(outDir);
    expect(files).toHaveLength(10);
    for (const file of files) {
      expect(statSync(join(outDir, file)).size).toBeGreaterThan(0);
    }
  });
});
