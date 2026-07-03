import * as cheerio from "cheerio";
import type { Page } from "playwright";
import { ADULT_CLICK_SETTLE_DELAY, ADULT_SELECTOR_TIMEOUT, PAGE_LOAD_TIMEOUT } from "./config.js";
import type { Chapter, ComicInfo, Section } from "./types.js";

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

  const idMatch = baseUrl.match(/\/comic\/(\d+)\//);
  const id = idMatch?.[1] ?? "0";

  const sections: Section[] = [];

  const chapterDiv = $(".chapter.cf").first();
  if (!chapterDiv.length) return { title, id, sections };

  chapterDiv.children("h4").each((_, h4) => {
    const sectionName = $(h4).find("span").text().trim();
    if (!sectionName) return;

    let ul = $(h4).next("ul");
    if (!ul.length) {
      ul = $(h4).next(".chapter-list").find("ul").first();
      if (!ul.length) return;
    }

    const chapters = parseChapters(ul.html() ?? "", baseUrl);
    if (chapters.length > 0) {
      sections.push({ name: sectionName, chapters });
    }
  });

  return { title, id, sections };
}

export async function parseComicPage(page: Page, url: string): Promise<ComicInfo> {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_LOAD_TIMEOUT,
  });
  if (!response?.ok()) {
    throw new Error(`Failed to load comic page: ${response?.status()}`);
  }

  const checkAdult = await page.$("#checkAdult");
  if (checkAdult) {
    await checkAdult.click();
    await page.waitForSelector(".chapter h4", { timeout: ADULT_SELECTOR_TIMEOUT });
    await page.waitForTimeout(ADULT_CLICK_SETTLE_DELAY);
  }

  const html = await page.content();
  return parseComicHTML(html, url);
}
