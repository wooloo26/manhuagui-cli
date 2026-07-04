import { describe, expect, it } from "vitest";
import { command } from "../src/cli.js";
import { filterSectionsByNames } from "../src/cli.js";
import type { Section } from "../src/types.js";

function makeSection(name: string, chapters: string[]): Section {
  return {
    name,
    chapters: chapters.map((title) => ({ title, url: `/${title}`, pageCount: 10 })),
  };
}

describe("filterSectionsByNames", () => {
  const sections = [
    makeSection("单行本", ["第01卷", "第02卷", "第03卷"]),
    makeSection("单话", ["第01回", "第02回", "第03回"]),
  ];

  it("returns all sections when no filters are set", () => {
    expect(filterSectionsByNames(sections)).toEqual(sections);
  });

  it("filters by exact section name", () => {
    const result = filterSectionsByNames(sections, "单话");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("单话");
  });

  it("filters by partial section name", () => {
    const result = filterSectionsByNames(sections, "行本");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("单行本");
  });

  it("filters by exact chapter title", () => {
    const result = filterSectionsByNames(sections, undefined, "第01回");
    expect(result).toHaveLength(1);
    expect(result[0].chapters).toHaveLength(1);
    expect(result[0].chapters[0].title).toBe("第01回");
  });

  it("filters by partial chapter title", () => {
    const result = filterSectionsByNames(sections, undefined, "01");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("单行本");
    expect(result[1].name).toBe("单话");
  });

  it("returns empty array when no sections match", () => {
    expect(filterSectionsByNames(sections, "nonexistent")).toEqual([]);
  });

  it("returns empty array when no chapters match", () => {
    expect(filterSectionsByNames(sections, undefined, "第99话")).toEqual([]);
  });

  it("filters both section and chapter simultaneously", () => {
    const result = filterSectionsByNames(sections, "单话", "第02");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("单话");
    expect(result[0].chapters).toHaveLength(1);
    expect(result[0].chapters[0].title).toBe("第02回");
  });
});

describe("command definition", () => {
  it("has the correct name", () => {
    expect((command.meta as { name: string }).name).toBe("manhuagui-cli");
  });

  it("has version", () => {
    expect((command.meta as { version: string }).version).toBeDefined();
  });

  it("defines url as positional arg", () => {
    expect((command.args as Record<string, { type: string }>).url.type).toBe("positional");
  });

  it("defines section as string arg with alias s", () => {
    const s = (command.args as Record<string, { type: string; alias?: string }>).section;
    expect(s.type).toBe("string");
    expect(s.alias).toBe("s");
  });

  it("defines chapter as string arg with alias c", () => {
    const c = (command.args as Record<string, { type: string; alias?: string }>).chapter;
    expect(c.type).toBe("string");
    expect(c.alias).toBe("c");
  });

  it("defines resume as boolean arg with default false", () => {
    const r = (command.args as Record<string, { type: string; default?: boolean }>).resume;
    expect(r.type).toBe("boolean");
    expect(r.default).toBe(false);
  });
});
