import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "tests", "fixtures", "_raw");

async function saveComicPage(url: string, filename: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const checkAdult = await page.$("#checkAdult");
    if (checkAdult) {
      console.log("  [adult check] clicking gate...");
      await checkAdult.click();
      await page.waitForSelector(".chapter", { timeout: 10000 });
      await page.waitForTimeout(500);
    }

    const title = await page.$eval("h1", (el) => el.textContent?.trim() ?? "unknown");
    console.log(`  Title: ${title}`);

    const sections = await page.$$eval(".chapter.cf h4", (els) =>
      els.map((el) => (el as HTMLElement).textContent?.trim() ?? ""),
    );
    console.log(`  Sections: ${sections.join(", ")}`);

    const firstChapterLink = await page.$(".chapter.cf ul a");
    let firstChapterUrl = "";
    if (firstChapterLink) {
      firstChapterUrl = (await firstChapterLink.getAttribute("href")) ?? "";
    }
    console.log(`  First chapter: ${firstChapterUrl}`);

    // Save comic page HTML
    const html = await page.content();
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    writeFileSync(join(OUTPUT_DIR, filename), html, "utf-8");
    console.log(`  Saved to ${join(OUTPUT_DIR, filename)}`);

    // Visit first chapter
    if (firstChapterUrl) {
      const chapterUrl = new URL(firstChapterUrl, url).href;
      console.log(`\nNavigating to chapter: ${chapterUrl}`);
      await page.goto(chapterUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

      const chCheckAdult = await page.$("#checkAdult");
      if (chCheckAdult) {
        console.log("  [adult check] clicking gate...");
        await chCheckAdult.click();
        await page.waitForSelector("#mangaFile", { timeout: 10000 });
        await page.waitForTimeout(500);
      }

      const pageCount = await page.evaluate(() => {
        const span = document.querySelector("#page");
        if (span?.parentElement) {
          const match = span.parentElement.textContent?.match(/\/(\d+)/);
          if (match) return parseInt(match[1], 10);
        }
        return 0;
      });
      console.log(`  Page count: ${pageCount}`);

      const hasPagination = await page.evaluate(() => {
        const links = document.querySelectorAll("#pagination a");
        return links.length > 1 ? Array.from(links).map((a) => (a as HTMLAnchorElement).href) : [];
      });
      if (hasPagination.length > 0) {
        console.log(`  Sub-pages: ${hasPagination.join(", ")}`);
      } else {
        console.log("  Sub-pages: none");
      }

      const imgSrc = await page.$eval("#mangaFile", (img) =>
        (img as HTMLImageElement).getAttribute("src") ?? "",
      );
      console.log(`  Image src: ${imgSrc}`);

      const chapterHtml = await page.content();
      const chFilename = filename.replace(".html", "-chapter.html");
      writeFileSync(join(OUTPUT_DIR, chFilename), chapterHtml, "utf-8");
      console.log(`  Saved to ${join(OUTPUT_DIR, chFilename)}`);
    }

    console.log("\nDone.");
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }
}

async function main() {
  const comicNormal = process.argv[2] || "https://www.manhuagui.com/comic/7580/";
  const comicAdult = process.argv[3] || "https://www.manhuagui.com/comic/4736/";

  console.log("=== Normal comic (7580) ===");
  await saveComicPage(comicNormal, "7580-comic.html");

  console.log("\n=== Adult comic (4736) ===");
  await saveComicPage(comicAdult, "4736-comic.html");
}

main();
