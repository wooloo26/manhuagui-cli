import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, initConfig } from "../../src/config.js";
import { saveProgress, chapterKey } from "../../src/progress.js";
import type { Section } from "../../src/types.js";
import { slugify } from "../../src/utils.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp-dir.js";

const { mockProcessChapter } = vi.hoisted(() => ({
  mockProcessChapter: vi.fn(),
}));

vi.mock("../../src/download.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/download.js")>();
  return {
    ...actual,
    processChapter: mockProcessChapter,
  };
});
const uiMock = {
  startPulse: vi.fn(),
  startSection: vi.fn(),
  startChapter: vi.fn(),
  pageProgress: vi.fn(),
  finishChapter: vi.fn(),
  startDelay: vi.fn(),
  stop: vi.fn(),
};

vi.mock("../../src/ui.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/ui.js")>();
  const MockDownloadUI = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    Object.assign(this, uiMock);
  });
  return {
    ...actual,
    DownloadUI: MockDownloadUI,
  };
});

const { runPipeline } = await import("../../src/pipeline.js");

function fakeResult(chapterUrl: string, count = 5) {
  const urls = Array.from(
    { length: count },
    (_, i) => `https://example.com/${String(i + 1).padStart(3, "0")}.webp`,
  );
  return { urls };
}

function makeSections(...counts: number[]): Section[] {
  let chIdx = 0;
  return counts.map((n, si) => ({
    name: `Section ${si + 1}`,
    chapters: Array.from({ length: n }, (_, ci) => {
      chIdx++;
      return {
        title: `Chapter ${chIdx}`,
        url: `https://example.com/comic/123/ch${chIdx}`,
        pageCount: 5,
      };
    }),
  }));
}

function makeChapterIndexMap(sections: Section[]): Map<string, number> {
  const map = new Map<string, number>();
  let idx = 1;
  for (const section of sections) {
    for (const chapter of section.chapters) {
      map.set(chapterKey(section.name, chapter.title), idx++);
    }
  }
  return map;
}

describe("runPipeline integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    vi.clearAllMocks();
    mockProcessChapter.mockReset();

    initConfig({
      outputBase: tmpDir,
      chapterDelayMin: 0,
      chapterDelayMax: 0,
      downloadDelay: 0,
    });

    mockProcessChapter.mockImplementation(async (opts) => {
      const { chapter, onProgress } = opts;
      const result = fakeResult(chapter.url);
      if (onProgress) {
        onProgress(0, result.urls.length, 0);
        onProgress(result.urls.length, result.urls.length, result.urls.length * 1000);
      }
      return {
        title: chapter.title,
        urls: result.urls,
        chapterUrl: chapter.url,
      };
    });
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  it("completes all chapters successfully", async () => {
    const sections = makeSections(2, 2);
    const chapterIndexMap = makeChapterIndexMap(sections);

    const result = await runPipeline({
      sections,
      chapterIndexMap,
      comicTitle: "Test Comic",
      comicUrl: "https://example.com/comic/123",
      browser: {} as Browser,
      cfg: config,
      resume: false,
      overwrite: false,
      totalPagesExpected: 20,
    });

    expect(result.succeeded).toBe(4);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(Object.keys(result.downloaded)).toHaveLength(4);
    expect(mockProcessChapter).toHaveBeenCalledTimes(4);
  });

  it("loads existing progress when resume is true", async () => {
    const sections = makeSections(2, 2);
    const chapterIndexMap = makeChapterIndexMap(sections);

    // Pre-save progress with 2 chapters done
    const comicDir = join(tmpDir, slugify("Test Comic"));
    saveProgress(comicDir, {
      comicTitle: "Test Comic",
      comicUrl: "https://example.com/comic/123",
      chapters: {
        [chapterKey("Section 1", "Chapter 1")]: {
          status: "done",
          pageCount: 5,
        },
        [chapterKey("Section 2", "Chapter 3")]: {
          status: "done",
          pageCount: 5,
        },
      },
    });

    const result = await runPipeline({
      sections,
      chapterIndexMap,
      comicTitle: "Test Comic",
      comicUrl: "https://example.com/comic/123",
      browser: {} as Browser,
      cfg: config,
      resume: true,
      overwrite: false,
      totalPagesExpected: 20,
    });

    // All chapters are processed
    expect(mockProcessChapter).toHaveBeenCalledTimes(4);
    expect(result.succeeded).toBe(4);

    // Verify progress file was updated
    const progressPath = join(comicDir, "progress.json");
    expect(existsSync(progressPath)).toBe(true);
    const saved = JSON.parse(readFileSync(progressPath, "utf-8"));
    expect(saved.chapters["Section 1::Chapter 1"].status).toBe("done");
  });

  it("continues after a chapter failure", async () => {
    mockProcessChapter
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(fakeResult("ch2"))
      .mockResolvedValueOnce(fakeResult("ch3"))
      .mockResolvedValueOnce(fakeResult("ch4"));

    const sections = makeSections(2, 2);
    const chapterIndexMap = makeChapterIndexMap(sections);

    const result = await runPipeline({
      sections,
      chapterIndexMap,
      comicTitle: "Fail Comic",
      comicUrl: "https://example.com/comic/123",
      browser: {} as Browser,
      cfg: config,
      resume: false,
      overwrite: false,
      totalPagesExpected: 20,
    });

    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Network error");
    expect(mockProcessChapter).toHaveBeenCalledTimes(4);
  });

  it("handles empty sections array", async () => {
    const result = await runPipeline({
      sections: [],
      chapterIndexMap: new Map(),
      comicTitle: "Empty Comic",
      comicUrl: "https://example.com/comic/123",
      browser: {} as Browser,
      cfg: config,
      resume: false,
      overwrite: false,
      totalPagesExpected: 0,
    });

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockProcessChapter).not.toHaveBeenCalled();
  });

  it("handles a chapter that returns null (no images)", async () => {
    mockProcessChapter
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fakeResult("ch2"));

    const sections = makeSections(1, 1);
    const chapterIndexMap = makeChapterIndexMap(sections);

    const result = await runPipeline({
      sections,
      chapterIndexMap,
      comicTitle: "Null Chapter",
      comicUrl: "https://example.com/comic/123",
      browser: {} as Browser,
      cfg: config,
      resume: false,
      overwrite: false,
      totalPagesExpected: 10,
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(Object.keys(result.downloaded)).toHaveLength(1);
  });

  it("saves progress after each chapter", async () => {
    const sections = makeSections(2);
    const chapterIndexMap = makeChapterIndexMap(sections);

    await runPipeline({
      sections,
      chapterIndexMap,
      comicTitle: "Progress Comic",
      comicUrl: "https://example.com/comic/123",
      browser: {} as Browser,
      cfg: config,
      resume: false,
      overwrite: false,
      totalPagesExpected: 10,
    });

    const progressPath = join(tmpDir, slugify("Progress Comic"), "progress.json");
    expect(existsSync(progressPath)).toBe(true);

    const saved = JSON.parse(readFileSync(progressPath, "utf-8"));
    expect(saved.comicTitle).toBe("Progress Comic");
    const chapterKeys = Object.keys(saved.chapters);
    const doneKeys = chapterKeys.filter((k) => saved.chapters[k].status === "done");
    expect(doneKeys).toHaveLength(2);
    for (const key of doneKeys) {
      expect(typeof saved.chapters[key].pageCount).toBe("number");
    }
  });

  it("calls UI lifecycle methods in order", async () => {
    const sections = makeSections(2);
    const chapterIndexMap = makeChapterIndexMap(sections);

    await runPipeline({
      sections,
      chapterIndexMap,
      comicTitle: "UI Comic",
      comicUrl: "https://example.com/comic/123",
      browser: {} as Browser,
      cfg: config,
      resume: false,
      overwrite: false,
      totalPagesExpected: 10,
    });

    const mockUI = uiMock;

    expect(mockUI.startPulse).toHaveBeenCalled();
    expect(mockUI.startSection).toHaveBeenCalledWith("Section 1");
    expect(mockUI.stop).toHaveBeenCalled();
  });
});
