import * as cheerio from "cheerio";
import type { Page } from "playwright";
import { handleAdultCheck } from "./browser.js";
import { config } from "./config.js";
import type { Chapter, ComicInfo, Section } from "./types.js";

function extractComicId(url: string): string {
  const match = url.match(/\/comic\/(\d+)\//);
  return match?.[1] ?? "0";
}

function parseSectionChapters(
  $: cheerio.CheerioAPI,
  h4: cheerio.AnyNode,
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
    chapters.push({ title, url, pageCount });
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
  if (!chapterDiv.length) return { title, id, sections };

  chapterDiv.children("h4").each((_, h4) => {
    const sectionName = $(h4).find("span").text().trim();
    if (!sectionName) return;

    const chapters = parseSectionChapters($, h4, baseUrl);
    if (chapters.length > 0) {
      sections.push({ name: sectionName, chapters });
    }
  });

  return { title, id, sections };
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
