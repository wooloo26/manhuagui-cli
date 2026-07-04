import { join } from "node:path";
import { sum } from "es-toolkit";
import type { Browser } from "playwright";
import { extractChapterImages } from "./chapter.js";
import type { Config } from "./config.js";
import { logger } from "./logger.js";
import type { ProgressData } from "./progress.js";
import {
  chapterKey,
  countCompletedPages,
  createProgress,
  loadProgress,
  saveProgress,
  updateChapterProgress,
} from "./progress.js";
import { SpeedTracker } from "./speed.js";
import type { Chapter, Section } from "./types.js";
import { DownloadUI } from "./ui.js";
import { randomInt, sleep, slugify } from "./utils.js";

export interface PipelineResult {
  collected: Record<string, { urls: string[]; chapterUrl: string }>;
  errors: string[];
  ok: number;
  failed: number;
}

function countCompletedChapters(progress: ProgressData): number {
  return sum(Object.values(progress.chapters).map((entry) => (entry.status === "done" ? 1 : 0)));
}

function recordChapterOutcome(opts: {
  progress: ProgressData;
  comicDir: string;
  key: string;
  success: boolean;
  collected?: { title: string; urls: string[]; chapterUrl: string };
  errorMsg?: string;
  tracker: SpeedTracker;
  chapterElapsed: number;
  ui: DownloadUI;
}): { progress: ProgressData; ok: number; failed: number } {
  const { progress, comicDir, key, success, collected, errorMsg, tracker, chapterElapsed } = opts;
  tracker.recordChapter(chapterElapsed);

  if (success && collected) {
    const updated = updateChapterProgress({
      comicDir,
      progress,
      key,
      status: "done",
      extra: { pageCount: collected.urls.length },
    });
    opts.ui.finishChapter(true);
    return { progress: updated, ok: 1, failed: 0 };
  }

  const updated = updateChapterProgress({
    comicDir,
    progress,
    key,
    status: "failed",
    extra: { error: errorMsg ?? "No images found" },
  });
  opts.ui.finishChapter(false);
  return { progress: updated, ok: 0, failed: 1 };
}

async function processChapter(opts: {
  chapter: Chapter;
  sectionName: string;
  comicTitle: string;
  browser: Browser;
  tracker: SpeedTracker;
  cfg: Config;
  overwrite: boolean;
  storedUrlsHash?: string;
  onHash?: (hash: string) => void;
  onProgress: (downloaded: number, total: number, bytes: number) => void;
}): Promise<{ title: string; urls: string[]; urlsHash: string; chapterUrl: string } | null> {
  const {
    chapter,
    sectionName,
    comicTitle,
    browser,
    tracker,
    cfg,
    overwrite,
    storedUrlsHash,
    onHash,
    onProgress,
  } = opts;
  const dirName = slugify(chapter.title);
  const outputDir = join(cfg.outputBase, slugify(comicTitle), slugify(sectionName), dirName);

  const result = await extractChapterImages({
    chapterUrl: chapter.url,
    browser,
    outputDir,
    tracker,
    cfg,
    storedUrlsHash,
    overwrite,
    onHash,
    onProgress,
  });
  if (!result) return null;

  return {
    title: chapter.title,
    urls: result.urls,
    urlsHash: result.urlsHash,
    chapterUrl: chapter.url,
  };
}

export interface RunPipelineOptions {
  sections: Section[];
  chapterIndexMap: Map<string, number>;
  comicTitle: string;
  comicUrl: string;
  browser: Browser;
  cfg: Config;
  resume: boolean;
  overwrite: boolean;
  totalPagesExpected: number;
}

export async function runPipeline(opts: RunPipelineOptions): Promise<PipelineResult> {
  const {
    sections,
    chapterIndexMap,
    comicTitle,
    comicUrl,
    browser,
    cfg,
    resume,
    overwrite,
    totalPagesExpected,
  } = opts;
  const collected: Record<string, { urls: string[]; chapterUrl: string }> = {};
  const errors: string[] = [];
  const comicDir = join(cfg.outputBase, slugify(comicTitle));
  let progress = resume
    ? (loadProgress(comicDir) ?? createProgress(comicTitle, comicUrl))
    : createProgress(comicTitle, comicUrl);
  saveProgress(comicDir, progress);

  const completedFromResume = countCompletedChapters(progress);
  const pendingChapters = sum(sections.map((s) => s.chapters.length));
  const totalChapters = completedFromResume + pendingChapters;
  const initialPagesDone = resume ? countCompletedPages(progress) : 0;
  const ui = new DownloadUI(
    totalChapters,
    completedFromResume,
    totalPagesExpected,
    initialPagesDone,
  );
  const tracker = new SpeedTracker();
  let ok = 0;
  let failed = 0;

  ui.startPulse();

  try {
    for (const section of sections) {
      ui.startSection(section.name);

      for (let i = 0; i < section.chapters.length; i++) {
        const ch = section.chapters[i];
        const key = chapterKey(section.name, ch.title);
        const chapterStart = Date.now();

        const chapterNum = chapterIndexMap.get(key) ?? completedFromResume + 1;
        ui.startChapter(chapterNum, ch.pageCount);

        const storedUrlsHash = progress.chapters[key]?.urlsHash;

        try {
          const r = await processChapter({
            chapter: ch,
            sectionName: section.name,
            comicTitle,
            browser,
            tracker,
            cfg,
            overwrite,
            storedUrlsHash,
            onHash: (h) => {
              progress = updateChapterProgress({
                comicDir,
                progress,
                key,
                status: "pending",
                extra: { urlsHash: h },
              });
            },
            onProgress: (downloaded, total, bytes) => {
              ui.pageProgress(downloaded, total, bytes);
            },
          });

          const outcome = recordChapterOutcome({
            progress,
            comicDir,
            key,
            success: r !== null,
            collected: r ?? undefined,
            errorMsg: r ? undefined : "No images found",
            tracker,
            chapterElapsed: Date.now() - chapterStart,
            ui,
          });
          progress = outcome.progress;

          if (r) {
            collected[r.title] = { urls: r.urls, chapterUrl: r.chapterUrl };
          }
          ok += outcome.ok;
          failed += outcome.failed;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(`${ch.title}: ${errMsg}`);
          logger.debug(`Chapter failed: ${ch.title} - ${errMsg}`);
          const outcome = recordChapterOutcome({
            progress,
            comicDir,
            key,
            success: false,
            errorMsg: errMsg,
            tracker,
            chapterElapsed: Date.now() - chapterStart,
            ui,
          });
          progress = outcome.progress;
          failed += outcome.failed;
        }

        if (i < section.chapters.length - 1) {
          const delayMs = randomInt(cfg.chapterDelayMin, cfg.chapterDelayMax);
          ui.startDelay(delayMs);
          await sleep(delayMs);
        }
      }
    }
  } finally {
    ui.stop();
  }

  return { collected, errors, ok, failed };
}
