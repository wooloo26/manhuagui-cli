import { sum } from "es-toolkit";
import { config } from "./config.js";

interface Sample {
  bytes: number;
  durationMs: number;
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

  estimateSection(remainingImages: number, remainingChapters: number): number {
    const speed = this.bytesPerSecond;
    const avgBytes = this.avgBytesPerImage;
    if (speed <= 0 || avgBytes <= 0 || remainingImages <= 0) return 0;

    const downloadTime = ((remainingImages * avgBytes) / speed) * 1000;

    const batchCount = Math.ceil(remainingImages / config.imageConcurrency);
    const avgBatchDelay = config.downloadDelay * 0.75;
    const batchDelay = Math.max(0, batchCount - 1) * avgBatchDelay;

    const avgChapterDelay = (config.chapterDelayMin + config.chapterDelayMax) / 2;
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
