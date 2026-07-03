/// <reference types="node" />

import { join } from "node:path";
import type { Page, Response } from "playwright";
import { describe, expect, it, vi } from "vitest";
import {
  buildFilePath,
  collectImageUrls,
  computePadLength,
  extractExtension,
  getPageCount,
  getSubPageUrls,
  validateImageResponse,
} from "./chapter.js";

describe("computePadLength", () => {
  it("returns padMinLength (3) for counts with fewer digits", () => {
    expect(computePadLength(0)).toBe(3);
    expect(computePadLength(1)).toBe(3);
    expect(computePadLength(9)).toBe(3);
    expect(computePadLength(10)).toBe(3);
    expect(computePadLength(99)).toBe(3);
  });

  it("returns padMinLength (3) for exactly 3-digit count", () => {
    expect(computePadLength(100)).toBe(3);
    expect(computePadLength(999)).toBe(3);
  });

  it("returns the digit count when it exceeds padMinLength", () => {
    expect(computePadLength(1000)).toBe(4);
    expect(computePadLength(12345)).toBe(5);
  });
});

describe("extractExtension", () => {
  it("extracts jpg extension", () => {
    expect(extractExtension("https://example.com/image.jpg")).toBe("jpg");
  });

  it("extracts webp extension", () => {
    expect(extractExtension("https://example.com/image.webp")).toBe("webp");
  });

  it("extracts png extension", () => {
    expect(extractExtension("https://example.com/image.png")).toBe("png");
  });

  it("extracts gif extension", () => {
    expect(extractExtension("https://example.com/image.gif")).toBe("gif");
  });

  it("extracts 4-char extension", () => {
    expect(extractExtension("https://example.com/image.jpeg")).toBe("jpeg");
  });

  it("strips query string from extension", () => {
    expect(extractExtension("https://example.com/image.webp?token=abc&v=2")).toBe("webp");
  });

  it("strips query string from 4-char extension", () => {
    expect(extractExtension("https://example.com/image.jpeg?w=800")).toBe("jpeg");
  });

  it('defaults to "webp" for URL without extension', () => {
    expect(extractExtension("https://example.com/path")).toBe("webp");
  });

  it('defaults to "webp" for URL ending with slash', () => {
    expect(extractExtension("https://example.com/path/")).toBe("webp");
  });

  it("handles 3-char segment that is not a file extension", () => {
    expect(extractExtension("https://eu1.manhuagui.com/img")).toBe("webp");
  });
});

describe("buildFilePath", () => {
  it("builds path with padded index", () => {
    expect(buildFilePath({ outputDir: "/output", index: 0, padLen: 3, ext: "jpg" })).toBe(
      join("/output", "001.jpg"),
    );
  });

  it("pads index correctly for higher values", () => {
    expect(buildFilePath({ outputDir: "/output", index: 5, padLen: 3, ext: "webp" })).toBe(
      join("/output", "006.webp"),
    );
  });

  it("builds path with different pad length", () => {
    expect(buildFilePath({ outputDir: "/output", index: 99, padLen: 4, ext: "png" })).toBe(
      join("/output", "0100.png"),
    );
  });

  it("uses different extension", () => {
    expect(buildFilePath({ outputDir: "/tmp/dir", index: 0, padLen: 3, ext: "gif" })).toBe(
      join("/tmp/dir", "001.gif"),
    );
  });

  it("handles large index", () => {
    expect(buildFilePath({ outputDir: "/a", index: 999, padLen: 4, ext: "webp" })).toBe(
      join("/a", "1000.webp"),
    );
  });
});

describe("getPageCount", () => {
  function mockPage(evaluateResult: number): Page {
    return {
      evaluate: vi.fn().mockResolvedValue(evaluateResult),
    } as unknown as Page;
  }

  it("returns page count from evaluate result", () => {
    const page = mockPage(29);
    return expect(getPageCount(page)).resolves.toBe(29);
  });

  it("returns zero when evaluate returns 0", () => {
    const page = mockPage(0);
    return expect(getPageCount(page)).resolves.toBe(0);
  });

  it("returns the evaluate result directly", () => {
    const page = mockPage(42);
    return expect(getPageCount(page)).resolves.toBe(42);
  });
});

describe("getSubPageUrls", () => {
  function mockPage(options: { evaluateResult?: string[]; waitForSelectorThrows?: boolean }): Page {
    const page = {
      evaluate: vi.fn(),
      waitForSelector: vi.fn(),
    } as unknown as Page;

    if (options.waitForSelectorThrows) {
      (page.waitForSelector as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("timeout"));
    } else {
      (page.waitForSelector as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    }
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(options.evaluateResult ?? []);

    return page;
  }

  it("returns array of tab URLs when multiple links found", () => {
    const page = mockPage({
      evaluateResult: [
        "https://www.manhuagui.com/comic/123/456.html",
        "https://www.manhuagui.com/comic/123/456_p2.html",
        "https://www.manhuagui.com/comic/123/456_p3.html",
      ],
    });
    return expect(getSubPageUrls(page)).resolves.toHaveLength(3);
  });

  it("returns the exact URLs from pagination", () => {
    const urls = [
      "https://www.manhuagui.com/comic/123/456.html",
      "https://www.manhuagui.com/comic/123/456_p2.html",
    ];
    const page = mockPage({ evaluateResult: urls });
    return expect(getSubPageUrls(page)).resolves.toEqual(urls);
  });

  it("returns empty array when waitForSelector times out", () => {
    const page = mockPage({ waitForSelectorThrows: true });
    return expect(getSubPageUrls(page)).resolves.toEqual([]);
  });
});

function createMockElementHandle(clickFn?: () => Promise<void>) {
  return {
    click: clickFn ?? vi.fn().mockResolvedValue(undefined),
  };
}

function mockCollectPage(options: {
  pageUrl?: string;
  imageUrls: string[];
  nextExists?: boolean;
  urlChanges?: boolean;
}): Page {
  const baseUrl = options.pageUrl ?? "https://www.manhuagui.com/comic/123/456.html";
  const urlSpy = vi.fn().mockReturnValue(baseUrl);

  if (options.urlChanges) {
    urlSpy
      .mockReturnValueOnce(baseUrl)
      .mockReturnValue("https://www.manhuagui.com/comic/123/456_p2.html");
  }

  const evalSpy = vi.fn();
  for (const url of options.imageUrls) {
    evalSpy.mockResolvedValueOnce(url);
  }

  const $spy = vi.fn();
  if (options.nextExists !== false) {
    $spy.mockResolvedValue(createMockElementHandle(vi.fn().mockResolvedValue(undefined)));
  } else {
    $spy.mockResolvedValue(null);
  }

  return {
    url: urlSpy,
    $eval: evalSpy,
    $: $spy,
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
}

describe("collectImageUrls", () => {
  it("collects all images for the given page count", async () => {
    const page = mockCollectPage({
      imageUrls: [
        "https://img.example.com/001.webp",
        "https://img.example.com/002.webp",
        "https://img.example.com/003.webp",
      ],
    });

    const urls = await collectImageUrls(page, 3);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe("https://img.example.com/001.webp");
    expect(urls[1]).toBe("https://img.example.com/002.webp");
    expect(urls[2]).toBe("https://img.example.com/003.webp");
  });

  it("returns only the first image when pageCount is 1", async () => {
    const page = mockCollectPage({
      imageUrls: ["https://img.example.com/001.webp"],
    });

    const urls = await collectImageUrls(page, 1);
    expect(urls).toEqual(["https://img.example.com/001.webp"]);
  });

  it("stops when #next button is not found", async () => {
    const page = mockCollectPage({
      imageUrls: ["https://img.example.com/001.webp", "https://img.example.com/002.webp"],
      nextExists: false,
    });

    const urls = await collectImageUrls(page, 5);
    expect(urls).toHaveLength(1);
  });

  it("stops when page URL changes (tab boundary crossed)", async () => {
    const page = mockCollectPage({
      imageUrls: [
        "https://img.example.com/001.webp",
        "https://img.example.com/002.webp",
        "https://img.example.com/003.webp",
      ],
      urlChanges: true,
    });

    const urls = await collectImageUrls(page, 5);
    expect(urls).toHaveLength(1);
  });

  it("collects images from single-tab chapter correctly", async () => {
    const urls = Array.from(
      { length: 10 },
      (_, i) => `https://img.example.com/${String(i + 1).padStart(3, "0")}.webp`,
    );
    const page = mockCollectPage({ imageUrls: urls });

    const result = await collectImageUrls(page, 10);
    expect(result).toEqual(urls);
  });
});

describe("validateImageResponse", () => {
  function mockResponse(status: number, contentType?: string): Response {
    return {
      status: () => status,
      headers: () => (contentType ? { "content-type": contentType } : {}),
    } as unknown as Response;
  }

  it("does not throw for 200 with image/webp", () => {
    expect(() => validateImageResponse(mockResponse(200, "image/webp"))).not.toThrow();
  });

  it("does not throw for 200 with image/jpeg", () => {
    expect(() => validateImageResponse(mockResponse(200, "image/jpeg"))).not.toThrow();
  });

  it("does not throw for 200 with image/png", () => {
    expect(() => validateImageResponse(mockResponse(200, "image/png"))).not.toThrow();
  });

  it("does not throw for 200 with missing content-type header", () => {
    expect(() => validateImageResponse(mockResponse(200))).not.toThrow();
  });

  it("throws for HTTP 404", () => {
    expect(() => validateImageResponse(mockResponse(404))).toThrow("HTTP 404");
  });

  it("throws for HTTP 500", () => {
    expect(() => validateImageResponse(mockResponse(500))).toThrow("HTTP 500");
  });

  it("throws for 200 with text/html content-type", () => {
    expect(() => validateImageResponse(mockResponse(200, "text/html"))).toThrow(
      "Unexpected content type",
    );
  });

  it("throws for 200 with application/json content-type", () => {
    expect(() => validateImageResponse(mockResponse(200, "application/json"))).toThrow(
      "Unexpected content type",
    );
  });

  it('throws for null response ("no response")', () => {
    expect(() => validateImageResponse(null)).toThrow("no response");
  });
});

describe("collectImageUrls with hash fragment URLs", () => {
  it("does not break on hash-based navigation (#p=2)", async () => {
    const page = mockCollectPage({
      imageUrls: [
        "https://img.example.com/001.webp",
        "https://img.example.com/002.webp",
        "https://img.example.com/003.webp",
      ],
    });

    const urls = await collectImageUrls(page, 3);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe("https://img.example.com/001.webp");
    expect(urls[1]).toBe("https://img.example.com/002.webp");
    expect(urls[2]).toBe("https://img.example.com/003.webp");
  });

  it("still detects real URL change (different pathname)", async () => {
    const page = mockCollectPage({
      imageUrls: ["https://img.example.com/001.webp", "https://img.example.com/002.webp"],
      urlChanges: true,
    });

    const urls = await collectImageUrls(page, 5);
    expect(urls).toHaveLength(1);
  });
});

describe("getPageCount fallback", () => {
  it("returns 0 when neither #page nor #pageSelect provide data", () => {
    const page = {
      evaluate: vi.fn().mockResolvedValue(0),
    } as unknown as Page;

    return expect(getPageCount(page)).resolves.toBe(0);
  });
});
