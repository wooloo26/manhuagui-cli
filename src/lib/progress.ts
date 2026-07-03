import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger.js";
import type { Section } from "./types.js";
import { atomicSaveJSON } from "./utils.js";

export interface ChapterProgress {
  status: "done" | "failed";
  pageCount?: number;
  error?: string;
}

export interface ProgressData {
  comicTitle: string;
  comicUrl: string;
  chapters: Record<string, ChapterProgress>;
}

export function loadProgress(comicDir: string): ProgressData | null {
  try {
    const raw = readFileSync(join(comicDir, "progress.json"), "utf-8");
    return JSON.parse(raw) as ProgressData;
  } catch {
    return null;
  }
}

export function loadProgressOrWarn(comicDir: string): ProgressData | null {
  try {
    const raw = readFileSync(join(comicDir, "progress.json"), "utf-8");
    return JSON.parse(raw) as ProgressData;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to load progress.json: ${message}`);
    return null;
  }
}

export function createProgress(comicTitle: string, comicUrl: string): ProgressData {
  return { comicTitle, comicUrl, chapters: {} };
}

export function saveProgress(comicDir: string, data: ProgressData): void {
  atomicSaveJSON(join(comicDir, "progress.json"), data);
}

export function markChapter(
  comicDir: string,
  progress: ProgressData,
  key: string,
  status: "done" | "failed",
  extra?: { pageCount?: number; error?: string },
): void {
  progress.chapters[key] = { status, ...extra };
  saveProgress(comicDir, progress);
}

export function chapterKey(sectionName: string, chapterTitle: string): string {
  return `${sectionName}::${chapterTitle}`;
}

export function filterPending(progress: ProgressData | null, sections: Section[]): Section[] {
  if (!progress) return sections;

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
