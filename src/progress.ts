import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger.js";
import type { Section } from "./types.js";
import { atomicSaveJSON } from "./utils.js";

export interface ChapterProgress {
  status: "done" | "failed" | "pending";
  pageCount?: number;
  urlsHash?: string;
  error?: string;
}

export interface ProgressData {
  comicTitle: string;
  comicUrl: string;
  chapters: Record<string, ChapterProgress>;
}

export function loadProgress(comicDir: string, warnOnError = false): ProgressData | null {
  try {
    const raw = readFileSync(join(comicDir, "progress.json"), "utf-8");
    return JSON.parse(raw) as ProgressData;
  } catch (err) {
    if (warnOnError) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Failed to load progress.json: ${message}`);
    }
    return null;
  }
}

export function createProgress(comicTitle: string, comicUrl: string): ProgressData {
  return { comicTitle, comicUrl, chapters: {} };
}

export function saveProgress(comicDir: string, data: ProgressData): void {
  atomicSaveJSON(join(comicDir, "progress.json"), data);
}

export function updateChapterProgress(opts: {
  comicDir: string;
  progress: ProgressData;
  key: string;
  status: "done" | "failed" | "pending";
  extra?: { pageCount?: number; urlsHash?: string; error?: string };
}): void {
  const prevUrlsHash = opts.progress.chapters[opts.key]?.urlsHash;
  const entry: ChapterProgress = { status: opts.status, ...opts.extra };
  if (opts.status !== "done" && prevUrlsHash && !entry.urlsHash) {
    entry.urlsHash = prevUrlsHash;
  }
  opts.progress.chapters[opts.key] = entry;
  saveProgress(opts.comicDir, opts.progress);
}

export function chapterKey(sectionName: string, chapterTitle: string): string {
  return `${sectionName}::${chapterTitle}`;
}

export function countCompletedPages(progress: ProgressData): number {
  let count = 0;
  for (const entry of Object.values(progress.chapters)) {
    if (entry.status === "done" && entry.pageCount) {
      count += entry.pageCount;
    }
  }
  return count;
}

export function filterPending(
  progress: ProgressData | null,
  sections: Section[],
  overwrite = false,
): Section[] {
  if (overwrite || !progress) return sections;

  return sections
    .map((s) => ({
      ...s,
      chapters: s.chapters.filter((c) => {
        const p = progress.chapters[chapterKey(s.name, c.title)];
        return p?.status !== "done";
      }),
    }))
    .filter((s) => s.chapters.length > 0);
}
