import { describe, expect, it } from "vitest";
import { rotateHost } from "./download.js";

describe("rotateHost", () => {
  it("rotates eu to eu1", () => {
    const result = rotateHost("https://eu.manhuagui.com/path/to/image.webp");
    expect(result).toBe("https://eu1.manhuagui.com/path/to/image.webp");
  });

  it("rotates eu1 to eu2", () => {
    const result = rotateHost("https://eu1.manhuagui.com/path/image.webp");
    expect(result).toBe("https://eu2.manhuagui.com/path/image.webp");
  });

  it("rotates eu2 to us", () => {
    const result = rotateHost("https://eu2.manhuagui.com/path/image.webp");
    expect(result).toBe("https://us.manhuagui.com/path/image.webp");
  });

  it("rotates us3 to eu (wrap around)", () => {
    const result = rotateHost("https://us3.manhuagui.com/path/image.webp");
    expect(result).toBe("https://eu.manhuagui.com/path/image.webp");
  });

  it("does not change non-CDN hostname", () => {
    const url = "https://www.manhuagui.com/path/image.webp";
    expect(rotateHost(url)).toBe(url);
  });

  it("does not change URL with two-part hostname", () => {
    const url = "http://example.com/path";
    expect(rotateHost(url)).toBe(url);
  });

  it("preserves query parameters", () => {
    const result = rotateHost("https://eu1.manhuagui.com/img.webp?token=abc&v=2");
    expect(result).toBe("https://eu2.manhuagui.com/img.webp?token=abc&v=2");
  });

  it("preserves HTTPS scheme", () => {
    const result = rotateHost("https://eu.manhuagui.com/img.webp");
    expect(result.startsWith("https://")).toBe(true);
  });

  it("preserves HTTP scheme", () => {
    const result = rotateHost("http://us.manhuagui.com/img.webp");
    expect(result.startsWith("http://")).toBe(true);
    expect(result).toBe("http://us1.manhuagui.com/img.webp");
  });

  it("preserves port in URL", () => {
    const result = rotateHost("https://eu.manhuagui.com:8080/path");
    expect(result).toBe("https://eu1.manhuagui.com:8080/path");
  });
});
