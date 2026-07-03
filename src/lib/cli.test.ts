import { describe, expect, it } from "vitest";
import { command } from "./cli.js";

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
