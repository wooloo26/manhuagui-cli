import * as cheerio from "cheerio";
import type { Element as CheerioElement } from "domhandler";
import type { Page } from "playwright";
import { handleAdultCheck } from "./browser.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import {
  type Chapter,
  ChapterSchema,
  type ComicInfo,
  ComicInfoSchema,
  type Section,
} from "./types.js";

function extractComicId(url: string): string {
  const match = url.match(/\/comic\/(\d+)\//);
  return match?.[1] ?? "0";
}

function parseSectionChapters(
  $: cheerio.CheerioAPI,
  h4: CheerioElement,
  baseUrl: string,
): Chapter[] {
  const chapters: Chapter[] = [];

  const directUl = $(h4).next("ul");
  if (directUl.length) {
    chapters.push(...parseChapters(directUl.html() ?? "", baseUrl));
  } else {
    const chapterList = $(h4).nextAll(".chapter-list").first();
    if (!chapterList.length) return chapters;

    chapterList.find("ul").each((_, ulEl) => {
      chapters.push(...parseChapters($(ulEl).html() ?? "", baseUrl));
    });
  }

  return chapters;
}

export function parseChapters(ulHTML: string, baseUrl: string): Chapter[] {
  const $ = cheerio.load(ulHTML);
  const chapters: Chapter[] = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const title = $(el).attr("title") || "Untitled";
    const spanHTML = $(el).find("span").html() ?? "";
    const pageMatch = spanHTML.match(/<i[^>]*>(\d+)p<\/i>/);
    const pageCount = pageMatch ? parseInt(pageMatch[1], 10) : 0;
    const url = new URL(href, baseUrl).href;
    const result = ChapterSchema.safeParse({ title, url, pageCount });
    if (result.success) {
      chapters.push(result.data);
    } else {
      logger.debug(
        `Skipping chapter with invalid data: ${JSON.stringify({ title, url, pageCount })}`,
      );
      logger.debug(`Validation errors: ${result.error.message}`);
    }
  });

  chapters.reverse();
  return chapters;
}

export function parseComicHTML(html: string, baseUrl: string): ComicInfo {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || "unknown";
  const id = extractComicId(baseUrl);
  const sections: Section[] = [];

  const chapterDiv = $(".chapter.cf").first();
  if (!chapterDiv.length) return ComicInfoSchema.parse({ title, id, sections });

  chapterDiv.children("h4").each((_, h4) => {
    const sectionName = $(h4).find("span").text().trim();
    if (!sectionName) return;

    const chapters = parseSectionChapters($, h4, baseUrl);
    if (chapters.length > 0) {
      sections.push({ name: sectionName, chapters });
    }
  });

  return ComicInfoSchema.parse({ title, id, sections });
}

export async function parseComicPage(page: Page, url: string): Promise<ComicInfo> {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: config.pageLoadTimeout,
  });
  if (!response?.ok()) {
    throw new Error(`Failed to load comic page: ${response?.status()}`);
  }

  await handleAdultCheck(page, ".chapter h4");
  const html = await page.content();
  return parseComicHTML(html, url);
}
