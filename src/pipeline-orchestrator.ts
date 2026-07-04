import type { Browser } from "playwright";
import type { Config } from "./config.js";
import { chapterKey, filterPending, loadProgress } from "./progress.js";
import type { PipelineResult } from "./tasks.js";
import { runPipeline } from "./tasks.js";
import type { ComicInfo, Section } from "./types.js";

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

export interface DownloadFlowOptions {
  sections: Section[];
  chapterIndexMap: Map<string, number>;
  comic: ComicInfo;
  url: string;
  browser: Browser;
  cfg: Config;
  resume: boolean;
  overwrite: boolean;
  totalChapters: number;
  totalPagesExpected: number;
}

export async function executeDownloadFlow(opts: DownloadFlowOptions): Promise<PipelineResult> {
  const {
    sections,
    chapterIndexMap,
    comic,
    url,
    browser,
    cfg,
    resume,
    overwrite,
    totalPagesExpected,
  } = opts;
  return runPipeline({
    sections,
    chapterIndexMap,
    comicTitle: comic.title,
    comicUrl: url,
    browser,
    cfg,
    resume,
    overwrite,
    totalPagesExpected,
  });
}
