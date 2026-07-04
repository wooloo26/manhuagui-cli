import chalk from "chalk";
import { sum } from "es-toolkit";
import logUpdate from "log-update";

// ===== SpeedTracker =====

export interface OverallEtaInput {
  overallStart: number;
  chapterStart: number;
  totalChapters: number;
  completedChapters: number;
  completedThisSession: number;
  chapterPageDone: number;
  chapterPageTotal: number;
}

export interface DelayParams {
  imageConcurrency: number;
  downloadDelay: number;
  chapterDelayMin: number;
  chapterDelayMax: number;
}

interface SpeedSample {
  bytes: number;
  durationMs: number;
}

export class SpeedTracker {
  private samples: SpeedSample[] = [];
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
    delays: DelayParams,
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

  static estimateOverallEta(input: OverallEtaInput, delays: DelayParams): number {
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

// ===== DownloadUI =====

const BAR_WIDTH = 40;
const SEP = chalk.dim(" \u00B7 ");

function formatDurationSeconds(seconds: number): string {
  return SpeedTracker.formatMs(seconds * 1000);
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || !Number.isFinite(bytesPerSec)) return "--";
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  const kb = bytesPerSec / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB/s`;
  return `${(kb / 1024).toFixed(1)} MB/s`;
}

function buildBar(filled: number, total: number): string {
  if (total <= 0) {
    return chalk.gray("-".repeat(BAR_WIDTH));
  }
  const pct = Math.min(filled / total, 1);
  const completeLen = Math.round(pct * BAR_WIDTH);
  if (completeLen >= BAR_WIDTH) {
    return chalk.green("=".repeat(BAR_WIDTH));
  }
  const comp = chalk.green("=".repeat(completeLen));
  const rest = chalk.gray("-".repeat(BAR_WIDTH - completeLen));
  return `${comp}>${rest}`;
}

export class DownloadUI {
  private overallStart: number;
  private chapterStart: number = 0;
  private chapterBytes: number = 0;
  private chapterNum: number = 0;
  private chapterPageDone: number = 0;
  private chapterPageTotal: number = 0;
  private sectionName: string = "";
  private totalChapters: number;
  private completedChapters: number;
  private completedThisSession: number = 0;
  private failedCount: number = 0;
  private delayEnd: number = 0;
  private numWidth: number;
  private pulseTimer?: ReturnType<typeof setInterval>;
  private lastOutput: string = "";
  private totalPagesDone: number = 0;
  private totalPagesExpected: number = 0;
  private pagesDoneBeforeChapter: number = 0;
  private currentChapterExpected: number = 0;
  private delays: DelayParams;

  constructor(
    totalChapters: number,
    initialCompleted: number,
    totalPagesExpected: number,
    initialPagesDone: number,
    delays: DelayParams,
  ) {
    this.overallStart = Date.now();
    this.totalChapters = totalChapters;
    this.completedChapters = initialCompleted;
    this.numWidth = String(totalChapters).length;
    this.totalPagesExpected = totalPagesExpected;
    this.totalPagesDone = initialPagesDone;
    this.delays = delays;
  }

  startSection(name: string): void {
    this.sectionName = name;
  }

  startChapter(num: number, pageCount: number): void {
    this.delayEnd = 0;
    this.chapterStart = Date.now();
    this.chapterBytes = 0;
    this.chapterNum = num;
    this.chapterPageDone = 0;
    this.chapterPageTotal = pageCount;
    this.currentChapterExpected = pageCount;
    this.pagesDoneBeforeChapter = this.totalPagesDone;
    this.render();
  }

  startDelay(ms: number): void {
    this.delayEnd = Date.now() + ms;
    this.render();
  }

  pageProgress(downloaded: number, total: number, bytes: number): void {
    this.chapterBytes += bytes;
    this.chapterPageDone = downloaded;
    this.chapterPageTotal = total;
    this.render();
  }

  finishChapter(ok: boolean): void {
    if (!ok) {
      this.failedCount++;
    } else {
      const delta = this.chapterPageTotal - this.currentChapterExpected;
      this.totalPagesExpected += delta;
      this.totalPagesDone += this.chapterPageTotal;
    }
    this.completedChapters++;
    this.completedThisSession++;
    this.render();
  }

  startPulse(): void {
    this.render();
    this.pulseTimer = setInterval(() => this.render(), 1000);
  }

  log(message: string): void {
    this.pulseTimer && clearInterval(this.pulseTimer);
    logUpdate.clear();
    console.log(chalk.red(`  ${message}`));
    this.lastOutput = "";
    this.render();
    this.pulseTimer = setInterval(() => this.render(), 1000);
  }

  stop(): void {
    this.pulseTimer && clearInterval(this.pulseTimer);
    logUpdate.done();
  }

  render(): void {
    const overallEtaSec = SpeedTracker.estimateOverallEta(
      {
        overallStart: this.overallStart,
        chapterStart: this.chapterStart,
        totalChapters: this.totalChapters,
        completedChapters: this.completedChapters,
        completedThisSession: this.completedThisSession,
        chapterPageDone: this.chapterPageDone,
        chapterPageTotal: this.chapterPageTotal,
      },
      this.delays,
    );
    const overallEta = formatDurationSeconds(overallEtaSec);
    const elapsedTotal = (Date.now() - this.overallStart) / 1000;
    const elapsed = formatDurationSeconds(elapsedTotal);

    const overallLine = this.buildOverallLine(elapsed, overallEta);
    const barLine = this.buildBarLine();
    const detailLine = this.buildDetailLine();

    const output = `${overallLine}\n${barLine}\n${detailLine}`;
    if (output !== this.lastOutput) {
      logUpdate(output);
      this.lastOutput = output;
    }
  }

  private buildOverallLine(elapsed: string, overallEta: string): string {
    const chInfo = `${chalk.cyan(String(this.completedChapters))}/${chalk.cyan(String(this.totalChapters))} ch`;
    const elapsedStr = chalk.gray(`${elapsed} elapsed`);
    const etaStr = chalk.blue(overallEta !== "--" ? `~ ${overallEta}` : "--");
    const overallParts: string[] = [chInfo];
    if (this.totalPagesExpected > 0) {
      const pgDone = this.pagesDoneBeforeChapter + this.chapterPageDone;
      overallParts.push(
        `${chalk.cyan(String(pgDone))}/${chalk.cyan(String(this.totalPagesExpected))} pg`,
      );
    }
    overallParts.push(elapsedStr, etaStr);
    let overallLine = ` Overall  ${overallParts.join(SEP)}`;
    if (this.failedCount > 0) {
      overallLine += `  ${chalk.red(`(${this.failedCount} failed)`)}`;
    }
    return overallLine;
  }

  private buildBarLine(): string {
    const bar = buildBar(this.chapterPageDone, this.chapterPageTotal);
    const pct =
      this.chapterPageTotal > 0
        ? Math.round((this.chapterPageDone / this.chapterPageTotal) * 100)
        : 0;
    return ` [${bar}] ${chalk.bold.white(String(pct).padStart(3))}%`;
  }

  private buildDetailLine(): string {
    const delayLine = this.buildDelayLine();
    if (delayLine !== null) return delayLine;

    const chLabel = `Ch.${String(this.chapterNum).padStart(this.numWidth, " ")}`;
    const secInfo = chalk.magenta(this.sectionName || "--");

    if (this.chapterPageTotal <= 0) {
      const pgInfo = `${chalk.white("0")}/${chalk.white("?")} pg`;
      return ` ${chLabel}  ${pgInfo}${SEP}${secInfo}${SEP}${chalk.gray("loading page...")}`;
    }

    if (this.chapterPageDone <= 0) {
      const pgInfo = `${chalk.white("0")}/${chalk.white(String(this.chapterPageTotal))} pg`;
      return ` ${chLabel}  ${pgInfo}${SEP}${secInfo}${SEP}${chalk.gray("collecting urls...")}`;
    }

    const pgInfo = `${chalk.white(String(this.chapterPageDone))}/${chalk.white(String(this.chapterPageTotal))} pg`;
    const elapsedChapter = (Date.now() - this.chapterStart) / 1000;
    const speed = formatSpeed(this.chapterBytes / Math.max(elapsedChapter, 0.5));
    const speedStr = chalk.green(speed);

    const { text: chEta, done: chEtaDone } = this.computeChapterEta(elapsedChapter);
    const chEtaStr = chEtaDone ? chalk.green(chEta) : chalk.yellow(chEta);
    return ` ${chLabel}  ${pgInfo}${SEP}${secInfo}${SEP}${speedStr}${SEP}${chEtaStr}`;
  }

  private buildDelayLine(): string | null {
    if (this.delayEnd <= 0) return null;
    const remaining = Math.max(0, Math.ceil((this.delayEnd - Date.now()) / 1000));
    if (remaining > 0) {
      return chalk.yellow(`   ${remaining}s until next chapter ...`);
    }
    this.delayEnd = 0;
    return null;
  }

  private computeChapterEta(elapsedChapter: number): { text: string; done: boolean } {
    if (this.chapterPageTotal > 0 && this.chapterPageDone >= this.chapterPageTotal) {
      return { text: "done", done: true };
    }
    if (this.chapterPageTotal > 0 && this.chapterPageDone > 0) {
      return {
        text: `~ ${formatDurationSeconds(
          ((this.chapterPageTotal - this.chapterPageDone) / this.chapterPageDone) * elapsedChapter,
        )}`,
        done: false,
      };
    }
    return { text: "--", done: false };
  }
}
