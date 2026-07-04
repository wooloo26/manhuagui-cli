import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  chapterKey,
  createProgress,
  filterPending,
  loadProgress,
  saveProgress,
  updateChapterProgress,
} from "../src/progress.js";
import type { Chapter, Section } from "../src/types.js";
import { slugify } from "../src/utils.js";

const testDir = join(tmpdir(), `manhuagui-progress-${Date.now()}`);

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("createProgress", () => {
  it("creates progress data with empty chapters", () => {
    const progress = createProgress("My Comic", "https://example.com/1");
    expect(progress.comicTitle).toBe("My Comic");
    expect(progress.comicUrl).toBe("https://example.com/1");
    expect(progress.chapters).toEqual({});
  });
});

describe("chapterKey", () => {
  it("joins section and chapter title", () => {
    expect(chapterKey("单行本", "第1巻")).toBe("单行本::第1巻");
  });

  it("handles empty strings", () => {
    expect(chapterKey("", "")).toBe("::");
  });
});

describe("saveProgress and loadProgress", () => {
  it("saves and loads progress data", () => {
    const comicDir = join(testDir, "test-comic");
    const progress = createProgress("My Comic", "https://example.com");
    progress.chapters["单行本::第1巻"] = { status: "done", pageCount: 20 };

    saveProgress(comicDir, progress);

    const loaded = loadProgress(comicDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.comicTitle).toBe("My Comic");
    expect(loaded?.chapters["单行本::第1巻"]).toEqual({ status: "done", pageCount: 20 });
  });

  it("returns null when progress file does not exist", () => {
    const loaded = loadProgress(join(testDir, "nonexistent"));
    expect(loaded).toBeNull();
  });

  it("returns null when progress file is invalid JSON", () => {
    const badDir = join(testDir, "bad-json");
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, "progress.json"), "not valid json");

    const loaded = loadProgress(badDir);
    expect(loaded).toBeNull();
  });
});

describe("updateChapterProgress", () => {
  it("records a finished chapter", () => {
    const comicDir = join(testDir, "mark-done");
    const progress = createProgress("Test", "https://example.com");

    updateChapterProgress({
      comicDir,
      progress,
      key: chapterKey("Vol 1", "Ch1"),
      status: "done",
      extra: { pageCount: 42 },
    });

    const loaded = loadProgress(comicDir);
    expect(loaded?.chapters["Vol 1::Ch1"]).toEqual({ status: "done", pageCount: 42 });
  });

  it("records a failed chapter", () => {
    const comicDir = join(testDir, "mark-failed");
    const progress = createProgress("Test", "https://example.com");

    updateChapterProgress({
      comicDir,
      progress,
      key: chapterKey("Vol 1", "Ch2"),
      status: "failed",
      extra: { error: "Connection error" },
    });

    const loaded = loadProgress(comicDir);
    expect(loaded?.chapters["Vol 1::Ch2"]).toEqual({
      status: "failed",
      error: "Connection error",
    });
  });
});

describe("filterPending", () => {
  let comicDir: string;

  beforeEach(() => {
    comicDir = join(testDir, `filter-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  function chapter(title: string, pageCount = 10): Chapter {
    return { title, url: `/comic/1/${title}.html`, pageCount };
  }

  function section(name: string, chapters: Chapter[]): Section {
    return { name, chapters };
  }

  function makeChapterDir(sectionName: string, chapterTitle: string) {
    const dir = join(comicDir, slugify(sectionName), slugify(chapterTitle));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "001.webp"), "fake");
  }

  it("removes done chapters regardless of filesystem", () => {
    const sections = [
      section("Vol 1", [chapter("Ch1"), chapter("Ch2")]),
      section("Vol 2", [chapter("Ch3")]),
    ];

    makeChapterDir("Vol 1", "Ch1");
    makeChapterDir("Vol 2", "Ch3");

    let progress = createProgress("Test", "https://example.com");
    progress = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch1",
      status: "done",
      extra: { pageCount: 10 },
    });
    progress = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 2::Ch3",
      status: "done",
      extra: { pageCount: 5 },
    });

    const filtered = filterPending(progress, sections, comicDir);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Vol 1");
    expect(filtered[0].chapters).toHaveLength(1);
    expect(filtered[0].chapters[0].title).toBe("Ch2");
  });

  it("keeps non-done chapters when no files on disk", () => {
    const sections = [section("Vol 1", [chapter("Ch1")])];

    const progress = createProgress("Test", "https://example.com");

    const filtered = filterPending(progress, sections, comicDir);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].chapters).toHaveLength(1);
  });

  it("keeps chapters with files on disk when there is no progress entry", () => {
    const sections = [section("Vol 1", [chapter("Ch1"), chapter("Ch2")])];

    makeChapterDir("Vol 1", "Ch1");

    const progress = createProgress("Test", "https://example.com");

    const filtered = filterPending(progress, sections, comicDir, false);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].chapters).toHaveLength(2);
  });

  it("without overwrite, does not skip pending chapters even when files exist on disk", () => {
    const sections = [section("Vol 1", [chapter("Ch1"), chapter("Ch2")])];

    makeChapterDir("Vol 1", "Ch1");

    let progress = createProgress("Test", "https://example.com");
    progress = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch1",
      status: "pending",
    });

    const filtered = filterPending(progress, sections, comicDir, false);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].chapters).toHaveLength(2);
    expect(filtered[0].chapters[0].title).toBe("Ch1");
    expect(filtered[0].chapters[1].title).toBe("Ch2");
  });

  it("does not skip pending chapter when it is the last chapter in a section", () => {
    const sections = [
      section("Vol 1", [chapter("Ch1"), chapter("Ch2")]),
      section("Vol 2", [chapter("Ch3")]),
    ];

    makeChapterDir("Vol 1", "Ch1");
    makeChapterDir("Vol 2", "Ch3");

    let progress = createProgress("Test", "https://example.com");
    progress = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch1",
      status: "done",
      extra: { pageCount: 10 },
    });
    progress = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 2::Ch3",
      status: "pending",
    });

    const filtered = filterPending(progress, sections, comicDir, false);

    expect(filtered).toHaveLength(2);
    expect(filtered[0].chapters).toHaveLength(1);
    expect(filtered[0].chapters[0].title).toBe("Ch2");
    expect(filtered[1].chapters).toHaveLength(1);
    expect(filtered[1].chapters[0].title).toBe("Ch3");
  });

  it("with overwrite, includes non-done chapters even when files exist on disk", () => {
    const sections = [section("Vol 1", [chapter("Ch1")])];

    makeChapterDir("Vol 1", "Ch1");

    let progress = createProgress("Test", "https://example.com");
    progress = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch1",
      status: "pending",
    });

    const filtered = filterPending(progress, sections, comicDir, true);

    expect(filtered).toHaveLength(1);
  });

  it("with overwrite, includes done chapters for re-download", () => {
    const sections = [section("Vol 1", [chapter("Ch1"), chapter("Ch2")])];

    makeChapterDir("Vol 1", "Ch1");
    makeChapterDir("Vol 1", "Ch2");

    let progress = createProgress("Test", "https://example.com");
    progress = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch1",
      status: "done",
      extra: { pageCount: 10 },
    });
    progress = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch2",
      status: "pending",
    });

    const filtered = filterPending(progress, sections, comicDir, true);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].chapters).toHaveLength(2);
    expect(filtered[0].chapters.map((c) => c.title).sort()).toEqual(["Ch1", "Ch2"]);
  });

  it("removes empty sections after filtering", () => {
    const sections = [section("Vol 1", [chapter("Ch1")])];

    makeChapterDir("Vol 1", "Ch1");

    let progress = createProgress("Test", "https://example.com");
    progress = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch1",
      status: "done",
      extra: { pageCount: 10 },
    });

    const filtered = filterPending(progress, sections, comicDir);
    expect(filtered).toEqual([]);
  });

  it("keeps failed chapters", () => {
    const sections = [section("Vol 1", [chapter("Ch1")])];

    const progress = createProgress("Test", "https://example.com");
    const updated = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch1",
      status: "failed",
      extra: { error: "timeout" },
    });

    const filtered = filterPending(updated, sections, comicDir);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].chapters).toHaveLength(1);
  });

  it("keeps failed chapter even when partial files exist on disk", () => {
    const sections = [section("Vol 1", [chapter("Ch1")])];

    makeChapterDir("Vol 1", "Ch1");

    const progress = createProgress("Test", "https://example.com");
    const updated = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch1",
      status: "failed",
      extra: { error: "timeout" },
    });

    const filtered = filterPending(updated, sections, comicDir, false);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].chapters).toHaveLength(1);
    expect(filtered[0].chapters[0].title).toBe("Ch1");
  });

  it("keeps pending chapter even when partial files exist on disk", () => {
    const sections = [section("Vol 1", [chapter("Ch1")])];

    makeChapterDir("Vol 1", "Ch1");

    const progress = createProgress("Test", "https://example.com");
    const updated = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch1",
      status: "pending",
    });

    const filtered = filterPending(updated, sections, comicDir, false);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].chapters).toHaveLength(1);
    expect(filtered[0].chapters[0].title).toBe("Ch1");
  });

  it("re-downloads done chapter when files were deleted by user", () => {
    const sections = [section("Vol 1", [chapter("Ch1")])];

    const progress = createProgress("Test", "https://example.com");
    const updated = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch1",
      status: "done",
      extra: { pageCount: 10 },
    });

    const filtered = filterPending(updated, sections, comicDir, false);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].chapters).toHaveLength(1);
    expect(filtered[0].chapters[0].title).toBe("Ch1");
  });

  it("skips done chapter when files exist and no overwrite", () => {
    const sections = [section("Vol 1", [chapter("Ch1"), chapter("Ch2")])];

    makeChapterDir("Vol 1", "Ch1");

    const progress = createProgress("Test", "https://example.com");
    const updated = updateChapterProgress({
      comicDir: testDir,
      progress,
      key: "Vol 1::Ch1",
      status: "done",
      extra: { pageCount: 10 },
    });

    const filtered = filterPending(updated, sections, comicDir, false);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].chapters).toHaveLength(1);
    expect(filtered[0].chapters[0].title).toBe("Ch2");
  });

  it("returns all sections when progress is null", () => {
    const sections = [section("Vol 1", [chapter("Ch1"), chapter("Ch2")])];
    const filtered = filterPending(null, sections, comicDir);
    expect(filtered).toEqual(sections);
  });
});
