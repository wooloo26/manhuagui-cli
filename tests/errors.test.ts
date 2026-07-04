import { describe, expect, it } from "vitest";
import { CanceledError } from "../src/utils.js";

describe("CanceledError", () => {
  it("is an instance of CanceledError", () => {
    expect(new CanceledError()).toBeInstanceOf(CanceledError);
  });

  it("is an instance of Error", () => {
    expect(new CanceledError()).toBeInstanceOf(Error);
  });

  it("has name CanceledError", () => {
    expect(new CanceledError().name).toBe("CanceledError");
  });

  it("has message User canceled", () => {
    expect(new CanceledError().message).toBe("User canceled");
  });
});
