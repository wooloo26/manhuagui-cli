import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { produce } from "immer";
import { z } from "zod";
import { logger } from "./logger.js";
import type { Section } from "./types.js";
import { atomicSaveJSON, slugify } from "./utils.js";

const ChapterProgressSchema = z.object({
  status: z.enum(["done", "failed", "pending"]),
  pageCount: z.number().int().nonnegative().optional(),
  urlsHash: z.string().optional(),
  error: z.string().optional(),
});

const ProgressDataSchema = z.object({
  comicTitle: z.string(),
  comicUrl: z.string(),
  chapters: z.record(z.string(), ChapterProgressSchema),
});

export type ChapterProgress = z.infer<typeof ChapterProgressSchema>;
export type ProgressData = z.infer<typeof ProgressDataSchema>;

export function loadProgress(comicDir: string, warnOnError = false): ProgressData | null {
  try {
    const raw = readFileSync(join(comicDir, "progress.json"), "utf-8");
    return ProgressDataSchema.parse(JSON.parse(raw));
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
}): ProgressData {
  const prevUrlsHash = opts.progress.chapters[opts.key]?.urlsHash;
  const updated = produce(opts.progress, (draft) => {
    const entry: ChapterProgress = { status: opts.status, ...opts.extra };
    if (opts.status !== "done" && prevUrlsHash && !entry.urlsHash) {
      entry.urlsHash = prevUrlsHash;
    }
    draft.chapters[opts.key] = entry;
  });
  saveProgress(opts.comicDir, updated);
  return updated;
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

export function isChapterDownloaded(
  comicDir: string,
  sectionName: string,
  chapterTitle: string,
): boolean {
  try {
    const dir = join(comicDir, slugify(sectionName), slugify(chapterTitle));
    const files = readdirSync(dir);
    for (const f of files) {
      if (!f.startsWith(".")) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function filterPending(
  progress: ProgressData | null,
  sections: Section[],
  comicDir: string,
  overwrite = false,
): Section[] {
  return sections
    .map((s) => ({
      ...s,
      chapters: s.chapters.filter((c) => {
        const p = progress?.chapters[chapterKey(s.name, c.title)];
        if (p?.status === "done" && !overwrite && isChapterDownloaded(comicDir, s.name, c.title))
          return false;
        return true;
      }),
    }))
    .filter((s) => s.chapters.length > 0);
}

export function buildChapterIndexMap(sections: Section[]): Map<string, number> {
  const map = new Map<string, number>();
  let idx = 0;
  for (const s of sections) {
    for (const c of s.chapters) {
      map.set(chapterKey(s.name, c.title), ++idx);
    }
  }
  return map;
}

export function filterSectionsForResume(
  sections: Section[],
  comicDir: string,
  shouldResume: boolean,
  overwrite: boolean,
): Section[] | null {
  if (!shouldResume) return sections;
  const progress = loadProgress(comicDir);
  const filtered = filterPending(progress, sections, comicDir, overwrite);
  return filtered.length === 0 ? null : filtered;
}
