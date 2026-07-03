import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function slugify(text: string): string {
  return text
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function humanDelay(min: number, max: number): Promise<void> {
  await sleep(randInt(min, max));
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
