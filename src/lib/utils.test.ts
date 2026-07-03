import { readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ensureDir, saveJSON, sleep, slugify } from "./utils.js";

describe("slugify", () => {
  it("keeps normal text unchanged", () => {
    expect(slugify("Hello World")).toBe("Hello World");
  });

  it("removes invalid filename characters", () => {
    expect(slugify('test<>:"/\\|?*')).toBe("test");
  });

  it("collapses multiple spaces to a single space", () => {
    expect(slugify("a   b")).toBe("a b");
  });

  it("trims leading and trailing whitespace", () => {
    expect(slugify("  hello  ")).toBe("hello");
  });

  it("preserves CJK characters", () => {
    expect(slugify("第1話 第一章")).toBe("第1話 第一章");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles text with only invalid chars", () => {
    expect(slugify('<":/\\\\?')).toBe("");
  });

  it("handles mixed special chars and whitespace", () => {
    expect(slugify('test < > : " / \\ | ? *  end')).toBe("test end");
  });
});

describe("sleep", () => {
  it("resolves after the specified delay", async () => {
    vi.useFakeTimers();
    const promise = sleep(500);
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("ensureDir", () => {
  const testDir = join(tmpdir(), `manhuagui-test-${Date.now()}`);

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("creates directory recursively", () => {
    const nested = join(testDir, "a", "b", "c");
    ensureDir(nested);
    expect(statSync(nested).isDirectory()).toBe(true);
  });

  it("does not throw when directory already exists", () => {
    ensureDir(testDir);
    expect(statSync(testDir).isDirectory()).toBe(true);
  });
});

describe("saveJSON", () => {
  const testDir = join(tmpdir(), `manhuagui-test-json-${Date.now()}`);

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("creates parent directory and writes JSON", () => {
    const filePath = join(testDir, "sub", "data.json");
    const data = { key: "value", count: 42 };

    saveJSON(filePath, data);

    const content = readFileSync(filePath, "utf-8");
    expect(JSON.parse(content)).toEqual(data);
  });

  it("writes arrays correctly", () => {
    const filePath = join(testDir, "list.json");
    const data = ["a", "b", "c"];

    saveJSON(filePath, data);

    const content = readFileSync(filePath, "utf-8");
    expect(JSON.parse(content)).toEqual(data);
  });

  it("pretty-prints with 2-space indentation", () => {
    const filePath = join(testDir, "pretty.json");
    const data = { a: 1 };

    saveJSON(filePath, data);

    const content = readFileSync(filePath, "utf-8");
    expect(content).toBe('{\n  "a": 1\n}');
  });
});
