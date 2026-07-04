import type { PipelineResult } from "./tasks.js";
import type { Section } from "./types.js";

export function applyFilters(
  sections: Section[],
  sectionFilter?: string,
  chapterFilter?: string,
): Section[] {
  let result = sections;
  if (sectionFilter) {
    result = result.filter((s) => s.name === sectionFilter || s.name.includes(sectionFilter));
  }
  if (chapterFilter) {
    result = result
      .map((s) => ({
        ...s,
        chapters: s.chapters.filter(
          (c) => c.title === chapterFilter || c.title.includes(chapterFilter),
        ),
      }))
      .filter((s) => s.chapters.length > 0);
  }
  return result;
}

export function logSectionSummary(sections: Section[], log: (msg: string) => void): number {
  const total = sumChapters(sections);
  log(`Sections: ${sections.map((s) => `${s.name}(${s.chapters.length})`).join(", ")}`);
  log(`Total chapters: ${total}`);
  return total;
}

export function displayDryRun(sections: Section[], log: (msg: string) => void): void {
  for (const section of sections) {
    for (const ch of section.chapters) {
      log(`  [${section.name}] ${ch.title}`);
    }
  }
  log("Dry run complete. No files downloaded.");
}

export function reportResults(
  result: PipelineResult,
  attempted: number,
  log: (msg: string) => void,
  warn: (msg: string) => void,
): void {
  log(`Done. ${result.ok} OK, ${result.failed} failed, ${attempted} total attempted.`);
  if (Object.keys(result.collected).length > 0) {
    log(`Downloaded ${Object.keys(result.collected).length} chapters.`);
  }
  if (result.errors.length > 0) {
    warn(`${result.errors.length} errors:`);
    for (const e of result.errors) warn(`  - ${e}`);
  }
}

export function countTotalPages(sections: Section[]): number {
  return sections.reduce((sum, s) => sum + s.chapters.reduce((cs, c) => cs + c.pageCount, 0), 0);
}

export function sumChapters(sections: Section[]): number {
  return sections.reduce((sum, s) => sum + s.chapters.length, 0);
}
