import { describe, expect, it } from "vitest";
import { pickUserAgent, USER_AGENTS } from "./config.js";

describe("pickUserAgent", () => {
  it("returns one of the configured user agents", () => {
    const agent = pickUserAgent();
    expect(USER_AGENTS).toContain(agent);
  });

  it("returns a string", () => {
    expect(typeof pickUserAgent()).toBe("string");
  });
});
