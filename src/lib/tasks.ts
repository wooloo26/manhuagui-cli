import { join } from "node:path";
import { Listr } from "listr2";
import type { Browser } from "playwright";
import { extractChapterImages } from "./chapter.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { ProgressData } from "./progress.js";
import { chapterKey, createProgress, loadProgress, markChapter, saveProgress } from "./progress.js";
import { SpeedTracker } from "./speed.js";
import type { Chapter, Section } from "./types.js";
import { humanDelay, slugify } from "./utils.js";

interface ResumeCounts {
  overallCompletedChapters: number;
  overallDownloadedImages: number;
  sectionDoneCounts: { chapters: number; images: number }[];
}

interface SectionTaskContext {
  section: Section;
  sectionImageTotal: number;
  doneCount: { chapters: number; images: number };
  collected: Record<string, { urls: string[]; chapterUrl: string }>;
  errors: string[];
  comicDir: string;
  progress: ProgressData;
  tracker: SpeedTracker;
  browser: Browser;
  comicTitle: string;
  overallCompletedChapters: number;
  overallDownloadedImages: number;
  totalChaptersAll: number;
  totalImagesAll: number;
}

function buildSectionTitle(opts: {
  tracker: SpeedTracker;
  label: string;
  ch: number;
  chTotal: number;
  imgDone: number;
  imgTotal: number;
  etaMs: number;
  totalEtaMs?: number;
}): string {
  const { tracker, label, ch, chTotal, imgDone, imgTotal, etaMs, totalEtaMs } = opts;
  const totalPart = totalEtaMs != null ? ` | ${SpeedTracker.formatMsCompact(totalEtaMs)}` : "";
  const eta =
    tracker.sampleCount >= 1 ? `[~${SpeedTracker.formatMsCompact(etaMs)}${totalPart}]` : "[--]";
  const img = imgTotal > 0 ? `  Img:${imgDone}/${imgTotal}` : "";
  return `${label}  ${ch}/${chTotal}${img}  ${eta}`;
}

function computeSectionImageTotals(sections: Section[]): number[] {
  return sections.map((s) => s.chapters.reduce((sum, ch) => sum + (ch.pageCount || 0), 0));
}

function computeResumeCounts(
  resume: boolean,
  sections: Section[],
  progress: ProgressData,
): ResumeCounts {
  let overallCompletedChapters = 0;
  let overallDownloadedImages = 0;
  const sectionDoneCounts: { chapters: number; images: number }[] = [];

  if (resume) {
    for (const entry of Object.values(progress.chapters)) {
      if (entry.status === "done") {
        overallCompletedChapters++;
        overallDownloadedImages += entry.pageCount ?? 0;
      }
    }
    for (const section of sections) {
      let doneChapters = 0;
      let doneImages = 0;
      const prefix = `${section.name}::`;
      for (const [key, entry] of Object.entries(progress.chapters)) {
        if (key.startsWith(prefix) && entry.status === "done") {
          doneChapters++;
          doneImages += entry.pageCount ?? 0;
        }
      }
      sectionDoneCounts.push({ chapters: doneChapters, images: doneImages });
    }
  } else {
    for (const _section of sections) {
      sectionDoneCounts.push({ chapters: 0, images: 0 });
    }
  }

  return { overallCompletedChapters, overallDownloadedImages, sectionDoneCounts };
}

function computeDownloadStats(opts: {
  sections: Section[];
  sectionImageTotals: number[];
  overallCompletedChapters: number;
  overallDownloadedImages: number;
}) {
  const { sections, sectionImageTotals, overallCompletedChapters, overallDownloadedImages } = opts;
  const pendingChapters = sections.reduce((sum, s) => sum + s.chapters.length, 0);
  const pendingImages = sectionImageTotals.reduce((sum, n) => sum + n, 0);
  const totalChapters = overallCompletedChapters + pendingChapters;
  const totalImages = overallDownloadedImages + pendingImages;
  return { pendingChapters, pendingImages, totalChapters, totalImages };
}

async function processChapter(opts: {
  chapter: Chapter;
  sectionName: string;
  comicTitle: string;
  browser: Browser;
  tracker: SpeedTracker;
}): Promise<{ title: string; urls: string[]; chapterUrl: string } | null> {
  const { chapter, sectionName, comicTitle, browser, tracker } = opts;
  const dirName = slugify(chapter.title);
  const outputDir = join(config.outputBase, slugify(comicTitle), slugify(sectionName), dirName);

  const urls = await extractChapterImages({
    chapterUrl: chapter.url,
    browser,
    outputDir,
    tracker,
  });
  if (urls.length === 0) return null;

  return { title: chapter.title, urls, chapterUrl: chapter.url };
}

function createSectionTask(ctx: SectionTaskContext) {
  const {
    section,
    sectionImageTotal,
    doneCount,
    collected,
    errors,
    comicDir,
    progress,
    tracker,
    browser,
    comicTitle,
    totalChaptersAll,
    totalImagesAll,
  } = ctx;

  const fullChTotal = section.chapters.length + doneCount.chapters;
  const fullImgTotal = sectionImageTotal + doneCount.images;
  let completedInSection = doneCount.chapters;
  let downloadedInSection = doneCount.images;
  let overallCompleted = ctx.overallCompletedChapters;
  let overallDownloaded = ctx.overallDownloadedImages;

  const initialImg = fullImgTotal > 0 ? `  Img:0/${fullImgTotal}` : "";

  return {
    title: `${section.name}  0/${fullChTotal}${initialImg}`,
    task: async (_taskCtx: unknown, task: { title: string }) => {
      const label = section.name;
      let currentChapterDownloaded = 0;

      for (let i = 0; i < section.chapters.length; i++) {
        const ch = section.chapters[i];
        currentChapterDownloaded = 0;

        tracker.onRecord = () => {
          currentChapterDownloaded++;
        };

        const updateTitle = () => {
          const remainingChapters = fullChTotal - completedInSection;
          const knownTotal = sectionImageTotal;
          const remainingImages =
            knownTotal > 0
              ? Math.max(0, fullImgTotal - downloadedInSection - currentChapterDownloaded)
              : completedInSection > 0
                ? Math.max(
                    0,
                    Math.round((downloadedInSection / completedInSection) * remainingChapters) -
                      currentChapterDownloaded,
                  )
                : 0;
          const sectionEta = tracker.estimateSection(remainingImages, remainingChapters);
          const totalRemainingImages = Math.max(
            0,
            totalImagesAll - overallDownloaded - currentChapterDownloaded,
          );
          const totalRemainingChapters = Math.max(0, totalChaptersAll - overallCompleted);
          const totalEta = tracker.estimateSection(totalRemainingImages, totalRemainingChapters);
          task.title = buildSectionTitle({
            tracker,
            label,
            ch: completedInSection + 1,
            chTotal: fullChTotal,
            imgDone: downloadedInSection + currentChapterDownloaded,
            imgTotal: knownTotal > 0 ? fullImgTotal : 0,
            etaMs: sectionEta,
            totalEtaMs: totalEta,
          });
        };

        updateTitle();
        const etaInterval = setInterval(updateTitle, 500);

        try {
          const r = await processChapter({
            chapter: ch,
            sectionName: section.name,
            comicTitle,
            browser,
            tracker,
          });
          if (r) {
            collected[r.title] = { urls: r.urls, chapterUrl: r.chapterUrl };
            markChapter({
              comicDir,
              progress,
              key: chapterKey(section.name, ch.title),
              status: "done",
              extra: { pageCount: r.urls.length },
            });
            completedInSection++;
            downloadedInSection += r.urls.length;
            overallCompleted++;
            overallDownloaded += r.urls.length;
          } else {
            markChapter({
              comicDir,
              progress,
              key: chapterKey(section.name, ch.title),
              status: "failed",
              extra: { error: "No images found" },
            });
            completedInSection++;
            overallCompleted++;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(`${ch.title}: ${errMsg}`);
          markChapter({
            comicDir,
            progress,
            key: chapterKey(section.name, ch.title),
            status: "failed",
            extra: { error: errMsg },
          });
          completedInSection++;
          overallCompleted++;
        } finally {
          clearInterval(etaInterval);
          tracker.onRecord = undefined;
          currentChapterDownloaded = 0;
        }

        if (i < section.chapters.length - 1) {
          await humanDelay(config.chapterDelayMin, config.chapterDelayMax);
        }
      }

      task.title = label;
    },
  };
}

export function createDownloadTasks(opts: {
  sections: Section[];
  comicTitle: string;
  comicUrl: string;
  browser: Browser;
  resume: boolean;
}) {
  const { sections, comicTitle, comicUrl, browser, resume } = opts;
  const collected: Record<string, { urls: string[]; chapterUrl: string }> = {};
  const errors: string[] = [];
  const comicDir = join(config.outputBase, slugify(comicTitle));
  const progress = resume
    ? (loadProgress(comicDir) ?? createProgress(comicTitle, comicUrl))
    : createProgress(comicTitle, comicUrl);
  saveProgress(comicDir, progress);

  const tracker = new SpeedTracker();
  const sectionImageTotals = computeSectionImageTotals(sections);
  const resumeCounts = computeResumeCounts(resume, sections, progress);
  const stats = computeDownloadStats({
    sections,
    sectionImageTotals,
    overallCompletedChapters: resumeCounts.overallCompletedChapters,
    overallDownloadedImages: resumeCounts.overallDownloadedImages,
  });

  logger.info(
    `Total: ${stats.totalChapters} chapters, ${stats.totalImages >= 0 ? `${stats.totalImages} images` : "?"}`,
  );

  return {
    collected,
    errors,
    tasks: new Listr(
      sections.map((section, si) =>
        createSectionTask({
          section,
          sectionImageTotal: sectionImageTotals[si],
          doneCount: resumeCounts.sectionDoneCounts[si],
          collected,
          errors,
          comicDir,
          progress,
          tracker,
          browser,
          comicTitle,
          overallCompletedChapters: resumeCounts.overallCompletedChapters,
          overallDownloadedImages: resumeCounts.overallDownloadedImages,
          totalChaptersAll: stats.totalChapters,
          totalImagesAll: stats.totalImages,
        }),
      ),
      {
        concurrent: false,
        rendererOptions: { collapseSubtasks: false },
      },
    ),
  };
}
