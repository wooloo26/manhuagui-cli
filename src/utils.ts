import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomInt as _randomInt } from "es-toolkit";

export function randomInt(min: number, max: number): number {
  if (min === max) return min;
  return _randomInt(min, max);
}

export function slugify(text: string): string {
  return text
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function humanDelay(min: number, max: number): Promise<void> {
  await sleep(randomInt(min, max));
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function saveJSON(filePath: string, data: unknown): void {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function atomicSaveJSON(filePath: string, data: unknown): void {
  ensureDir(dirname(filePath));
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
}

export function hashUrls(urls: string[]): string {
  return createHash("sha256").update(urls.sort().join("\n")).digest("hex").slice(0, 16);
}
