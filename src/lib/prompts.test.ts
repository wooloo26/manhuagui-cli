import { describe, expect, it } from "vitest";
import { assertNotCanceled } from "./prompts.js";

describe("assertNotCanceled", () => {
  it("passes through a normal string value", () => {
    const result = "https://www.manhuagui.com/comic/123/";
    assertNotCanceled(result);
    expect(result).toBe("https://www.manhuagui.com/comic/123/");
  });

  it("passes through a normal boolean value", () => {
    const result = true;
    assertNotCanceled(result);
    expect(result).toBe(true);
  });

  it("passes through an array value", () => {
    const result = ["item1", "item2"];
    assertNotCanceled(result);
    expect(result).toEqual(["item1", "item2"]);
  });
});
