import { describe, expect, it } from "vitest";
import { CancelledError } from "../src/errors.js";

describe("CancelledError", () => {
  it("is an instance of CancelledError", () => {
    expect(new CancelledError()).toBeInstanceOf(CancelledError);
  });

  it("is an instance of Error", () => {
    expect(new CancelledError()).toBeInstanceOf(Error);
  });

  it("has name CancelledError", () => {
    expect(new CancelledError().name).toBe("CancelledError");
  });

  it("has message User cancelled", () => {
    expect(new CancelledError().message).toBe("User cancelled");
  });
});
