import { join } from "node:path";
import { sum } from "es-toolkit";
import type { Browser } from "playwright";
import type { Config } from "./config.js";
import { processChapter } from "./download.js";
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
import type { Section } from "./types.js";
import { DownloadUI, SpeedTracker } from "./ui.js";
import { randomInt, sleep, slugify } from "./utils.js";

export interface PipelineResult {
  downloaded: Record<string, { urls: string[]; chapterUrl: string }>;
  errors: string[];
  succeeded: number;
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
  downloaded?: { title: string; urls: string[]; chapterUrl: string };
  errorMsg?: string;
  tracker: SpeedTracker;
  chapterElapsed: number;
  ui: DownloadUI;
}): { progress: ProgressData; succeeded: number; failed: number } {
  const { progress, comicDir, key, success, downloaded, errorMsg, tracker, chapterElapsed } = opts;
  tracker.recordChapter(chapterElapsed);

  if (success && downloaded) {
    const updated = updateChapterProgress({
      comicDir,
      progress,
      key,
      status: "done",
      extra: { pageCount: downloaded.urls.length },
    });
    opts.ui.finishChapter(true);
    return { progress: updated, succeeded: 1, failed: 0 };
  }

  const updated = updateChapterProgress({
    comicDir,
    progress,
    key,
    status: "failed",
    extra: { error: errorMsg ?? "No images found" },
  });
  opts.ui.finishChapter(false);
  return { progress: updated, succeeded: 0, failed: 1 };
}

export interface PipelineOptions {
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

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
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
  const downloaded: Record<string, { urls: string[]; chapterUrl: string }> = {};
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
    {
      chapterDelayMin: cfg.chapterDelayMin,
      chapterDelayMax: cfg.chapterDelayMax,
      imageConcurrency: cfg.imageConcurrency,
      downloadDelay: cfg.downloadDelay,
    },
  );
  const tracker = new SpeedTracker();
  let succeeded = 0;
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

        try {
          const r = await processChapter({
            chapter: ch,
            sectionName: section.name,
            comicTitle,
            browser,
            tracker,
            cfg,
            overwrite,
            onProgress: (downloaded, total, bytes) => {
              ui.pageProgress(downloaded, total, bytes);
            },
          });

          const outcome = recordChapterOutcome({
            progress,
            comicDir,
            key,
            success: r !== null,
            downloaded: r ?? undefined,
            errorMsg: r ? undefined : "No images found",
            tracker,
            chapterElapsed: Date.now() - chapterStart,
            ui,
          });
          progress = outcome.progress;

          if (r) {
            downloaded[r.title] = { urls: r.urls, chapterUrl: r.chapterUrl };
          }
          succeeded += outcome.succeeded;
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

  return { downloaded, errors, succeeded, failed };
}
