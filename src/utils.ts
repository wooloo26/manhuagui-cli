import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomInt as _randomInt } from "es-toolkit";

export class CanceledError extends Error {
  constructor() {
    super("User canceled");
    this.name = "CanceledError";
  }
}

export function randomInt(min: number, max: number): number {
  if (min === max) return min;
  return _randomInt(min, max);
}

export function slugify(text: string): string {
  return text
    .replace(/[\0<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.{2,}/g, ".")
    .trim();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function atomicSaveJSON(filePath: string, data: unknown): void {
  ensureDir(dirname(filePath));
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
}
