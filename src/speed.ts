import { sum } from "es-toolkit";

export interface OverallEtaInput {
  overallStart: number;
  chapterStart: number;
  totalChapters: number;
  completedChapters: number;
  completedThisSession: number;
  chapterPageDone: number;
  chapterPageTotal: number;
}

export interface EtaDelayParams {
  chapterDelayMin: number;
  chapterDelayMax: number;
}

export function estimateOverallEta(input: OverallEtaInput, delays: EtaDelayParams): number {
  const {
    overallStart,
    chapterStart,
    totalChapters,
    completedChapters,
    completedThisSession,
    chapterPageDone,
    chapterPageTotal,
  } = input;

  const elapsed = (Date.now() - overallStart) / 1000;
  const remaining = totalChapters - completedChapters;
  if (remaining <= 0) return 0;

  if (completedThisSession >= 1) {
    return remaining * (elapsed / completedThisSession);
  }

  if (chapterPageTotal <= 0 || chapterPageDone <= 0) {
    return 0;
  }

  const chapterElapsed = (Date.now() - chapterStart) / 1000;
  const pageRate = chapterPageDone / chapterElapsed;
  const chapterRemainingSec = (chapterPageTotal - chapterPageDone) / Math.max(pageRate, 0.001);

  const avgDelay = (delays.chapterDelayMin + delays.chapterDelayMax) / 2 / 1000;
  const estimatedChapterSec = chapterElapsed + chapterRemainingSec + avgDelay;

  return chapterRemainingSec + (remaining - 1) * Math.max(estimatedChapterSec, 0);
}

interface Sample {
  bytes: number;
  durationMs: number;
}

export interface RemainingDelayParams {
  imageConcurrency: number;
  downloadDelay: number;
  chapterDelayMin: number;
  chapterDelayMax: number;
}

export class SpeedTracker {
  private samples: Sample[] = [];
  private maxSamples = 20;
  private chapterDurations: number[] = [];
  private maxChapterSamples = 50;

  record(bytes: number, durationMs: number): void {
    if (bytes <= 0 || durationMs <= 0) return;
    this.samples.push({ bytes, durationMs });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  recordChapter(durationMs: number): void {
    if (durationMs <= 0) return;
    this.chapterDurations.push(durationMs);
    if (this.chapterDurations.length > this.maxChapterSamples) {
      this.chapterDurations.shift();
    }
  }

  get bytesPerSecond(): number {
    const totalBytes = sum(this.samples.map((x) => x.bytes));
    const totalMs = sum(this.samples.map((x) => x.durationMs));
    return totalMs > 0 ? (totalBytes / totalMs) * 1000 : 0;
  }

  get avgBytesPerImage(): number {
    if (this.samples.length === 0) return 0;
    return sum(this.samples.map((x) => x.bytes)) / this.samples.length;
  }

  get avgChapterDurationMs(): number {
    if (this.chapterDurations.length === 0) return 0;
    return sum(this.chapterDurations) / this.chapterDurations.length;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  estimateRemainingMs(
    remainingImages: number,
    remainingChapters: number,
    delays: RemainingDelayParams,
  ): number {
    const speed = this.bytesPerSecond;
    const avgBytes = this.avgBytesPerImage;
    if (speed <= 0 || avgBytes <= 0 || remainingImages <= 0) return 0;

    const downloadTime = ((remainingImages * avgBytes) / speed) * 1000;

    const batchCount = Math.ceil(remainingImages / delays.imageConcurrency);
    const avgBatchDelay = delays.downloadDelay * 0.75;
    const batchDelay = Math.max(0, batchCount - 1) * avgBatchDelay;

    const avgChapterDelay = (delays.chapterDelayMin + delays.chapterDelayMax) / 2;
    const chapterDelay = Math.max(0, remainingChapters - 1) * avgChapterDelay;

    return Math.round(downloadTime + batchDelay + chapterDelay);
  }

  static formatMs(ms: number): string {
    if (ms <= 0) return "--";
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  static formatMsCompact(ms: number): string {
    if (ms <= 0) return "--";
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return secs > 0 ? `${minutes}m${secs}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  }
}
