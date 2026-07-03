import { join } from "node:path";
import type { Browser } from "playwright";
import { extractChapterImages } from "./chapter.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { ProgressData } from "./progress.js";
import { chapterKey, createProgress, loadProgress, markChapter, saveProgress } from "./progress.js";
import { SpeedTracker } from "./speed.js";
import type { Chapter, Section } from "./types.js";
import { DownloadUI } from "./ui.js";
import { randInt, sleep, slugify } from "./utils.js";

export interface PipelineResult {
  collected: Record<string, { urls: string[]; chapterUrl: string }>;
  errors: string[];
  ok: number;
  failed: number;
}

function countCompleted(progress: ProgressData): number {
  let count = 0;
  for (const entry of Object.values(progress.chapters)) {
    if (entry.status === "done") count++;
  }
  return count;
}

async function processChapter(opts: {
  chapter: Chapter;
  sectionName: string;
  comicTitle: string;
  browser: Browser;
  tracker: SpeedTracker;
  onProgress: (downloaded: number, total: number, bytes: number) => void;
}): Promise<{ title: string; urls: string[]; chapterUrl: string } | null> {
  const { chapter, sectionName, comicTitle, browser, tracker, onProgress } = opts;
  const dirName = slugify(chapter.title);
  const outputDir = join(config.outputBase, slugify(comicTitle), slugify(sectionName), dirName);

  const urls = await extractChapterImages({
    chapterUrl: chapter.url,
    browser,
    outputDir,
    tracker,
    onProgress,
  });
  if (urls.length === 0) return null;

  return { title: chapter.title, urls, chapterUrl: chapter.url };
}

export interface RunPipelineOptions {
  sections: Section[];
  comicTitle: string;
  comicUrl: string;
  browser: Browser;
  resume: boolean;
}

export async function runPipeline(opts: RunPipelineOptions): Promise<PipelineResult> {
  const { sections, comicTitle, comicUrl, browser, resume } = opts;
  const collected: Record<string, { urls: string[]; chapterUrl: string }> = {};
  const errors: string[] = [];
  const comicDir = join(config.outputBase, slugify(comicTitle));
  const progress = resume
    ? (loadProgress(comicDir) ?? createProgress(comicTitle, comicUrl))
    : createProgress(comicTitle, comicUrl);
  saveProgress(comicDir, progress);

  const completedFromResume = countCompleted(progress);
  const pendingChapters = sections.reduce((sum, s) => sum + s.chapters.length, 0);
  const totalChapters = completedFromResume + pendingChapters;
  const ui = new DownloadUI(comicTitle, totalChapters, completedFromResume);
  const tracker = new SpeedTracker();
  let chapterNum = completedFromResume + 1;
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

        ui.startChapter(chapterNum);

        try {
          const r = await processChapter({
            chapter: ch,
            sectionName: section.name,
            comicTitle,
            browser,
            tracker,
            onProgress: (downloaded, total, bytes) => {
              ui.pageProgress(downloaded, total, bytes);
            },
          });

          const chapterElapsed = Date.now() - chapterStart;
          tracker.recordChapter(chapterElapsed);

          if (r) {
            collected[r.title] = { urls: r.urls, chapterUrl: r.chapterUrl };
            markChapter({
              comicDir,
              progress,
              key,
              status: "done",
              extra: { pageCount: r.urls.length },
            });
            ok++;
            ui.finishChapter(true);
          } else {
            markChapter({
              comicDir,
              progress,
              key,
              status: "failed",
              extra: { error: "No images found" },
            });
            failed++;
            ui.finishChapter(false);
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(`${ch.title}: ${errMsg}`);
          markChapter({
            comicDir,
            progress,
            key,
            status: "failed",
            extra: { error: errMsg },
          });
          logger.debug(`Chapter failed: ${ch.title} - ${errMsg}`);
          failed++;
          ui.finishChapter(false);
        }

        chapterNum++;

        if (i < section.chapters.length - 1) {
          const delayMs = randInt(config.chapterDelayMin, config.chapterDelayMax);
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
