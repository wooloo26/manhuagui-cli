import chalk from "chalk";
import logUpdate from "log-update";
import { config } from "./config.js";

const BAR_WIDTH = 40;
const SEP = chalk.dim(" \u00B7 ");

function formatDuration(seconds: number): string {
  if (seconds <= 0 || !Number.isFinite(seconds)) return "--";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
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

  constructor(_comicTitle: string, totalChapters: number, initialCompleted: number) {
    this.overallStart = Date.now();
    this.totalChapters = totalChapters;
    this.completedChapters = initialCompleted;
    this.numWidth = String(totalChapters).length;
  }

  startSection(name: string): void {
    this.sectionName = name;
  }

  startChapter(num: number): void {
    this.delayEnd = 0;
    this.chapterStart = Date.now();
    this.chapterBytes = 0;
    this.chapterNum = num;
    this.chapterPageDone = 0;
    this.chapterPageTotal = 0;
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

  private computeOverallEta(): number {
    const elapsed = (Date.now() - this.overallStart) / 1000;
    const remaining = this.totalChapters - this.completedChapters;
    if (remaining <= 0) return 0;

    if (this.completedThisSession >= 1) {
      return remaining * (elapsed / this.completedThisSession);
    }

    if (this.chapterPageTotal <= 0 || this.chapterPageDone <= 0) {
      return 0;
    }

    const chapterElapsed = (Date.now() - this.chapterStart) / 1000;
    const pageRate = this.chapterPageDone / chapterElapsed;
    const chapterRemainingSec =
      (this.chapterPageTotal - this.chapterPageDone) / Math.max(pageRate, 0.001);

    const avgDelay = (config.chapterDelayMin + config.chapterDelayMax) / 2 / 1000;
    const estimatedChapterSec = chapterElapsed + chapterRemainingSec + avgDelay;

    return chapterRemainingSec + (remaining - 1) * Math.max(estimatedChapterSec, 0);
  }

  render(): void {
    const overallEtaSec = this.computeOverallEta();
    const overallEta = formatDuration(overallEtaSec);
    const elapsedTotal = (Date.now() - this.overallStart) / 1000;
    const elapsed = formatDuration(elapsedTotal);

    const chInfo = `${chalk.cyan(String(this.completedChapters))}/${chalk.cyan(String(this.totalChapters))} ch`;
    const elapsedStr = chalk.gray(`${elapsed} elapsed`);
    const etaStr = chalk.blue(overallEta !== "--" ? `~ ${overallEta}` : "--");
    let overallLine = ` Overall  ${chInfo}${SEP}${elapsedStr}${SEP}${etaStr}`;
    if (this.failedCount > 0) {
      overallLine += `  ${chalk.red(`(${this.failedCount} failed)`)}`;
    }

    const bar = buildBar(this.chapterPageDone, this.chapterPageTotal);
    const pct =
      this.chapterPageTotal > 0
        ? Math.round((this.chapterPageDone / this.chapterPageTotal) * 100)
        : 0;
    const barLine = ` [${bar}] ${chalk.bold.white(String(pct).padStart(3))}%`;

    const elapsedChapter = (Date.now() - this.chapterStart) / 1000;
    const speed = formatSpeed(this.chapterBytes / Math.max(elapsedChapter, 0.5));
    let chEta: string;
    let chEtaDone = false;
    if (this.chapterPageTotal > 0 && this.chapterPageDone >= this.chapterPageTotal) {
      chEta = "done";
      chEtaDone = true;
    } else if (this.chapterPageTotal > 0 && this.chapterPageDone > 0) {
      chEta = `~ ${formatDuration(
        ((this.chapterPageTotal - this.chapterPageDone) / this.chapterPageDone) * elapsedChapter,
      )}`;
    } else {
      chEta = "--";
    }

    let detailLine = "";
    if (this.delayEnd > 0) {
      const remaining = Math.max(0, Math.ceil((this.delayEnd - Date.now()) / 1000));
      if (remaining > 0) {
        detailLine = chalk.yellow(`   ${remaining}s until next chapter ...`);
      } else {
        this.delayEnd = 0;
      }
    }

    if (!detailLine) {
      const chLabel = `Ch.${String(this.chapterNum).padStart(this.numWidth, " ")}`;

      if (this.chapterPageTotal <= 0) {
        const pgInfo = `${chalk.white("0")}/${chalk.white("?")} pg`;
        const secInfo = chalk.magenta(this.sectionName || "--");
        detailLine = ` ${chLabel}  ${pgInfo}${SEP}${secInfo}${SEP}${chalk.gray("fetching...")}`;
      } else if (this.chapterPageDone <= 0) {
        const pgInfo = `${chalk.white("0")}/${chalk.white(String(this.chapterPageTotal))} pg`;
        const secInfo = chalk.magenta(this.sectionName || "--");
        detailLine = ` ${chLabel}  ${pgInfo}${SEP}${secInfo}${SEP}${chalk.gray("downloading...")}`;
      } else {
        const pgInfo = `${chalk.white(String(this.chapterPageDone))}/${chalk.white(String(this.chapterPageTotal))} pg`;
        const secInfo = chalk.magenta(this.sectionName || "--");
        const speedStr = chalk.green(speed);
        const chEtaStr = chEtaDone ? chalk.green(chEta) : chalk.yellow(chEta);
        detailLine = ` ${chLabel}  ${pgInfo}${SEP}${secInfo}${SEP}${speedStr}${SEP}${chEtaStr}`;
      }
    }

    const output = `${overallLine}\n${barLine}\n${detailLine}`;

    if (output !== this.lastOutput) {
      logUpdate(output);
      this.lastOutput = output;
    }
  }
}
