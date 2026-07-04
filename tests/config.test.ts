import { describe, expect, it } from "vitest";
import { config, pickUserAgent } from "../src/config.js";

describe("pickUserAgent", () => {
  it("returns one of the configured user agents", () => {
    const agent = pickUserAgent();
    expect(config.userAgents).toContain(agent);
  });

  it("returns a string", () => {
    expect(typeof pickUserAgent()).toBe("string");
  });
});
