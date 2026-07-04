import { describe, expect, it } from "vitest";
import { parseChapters, parseComicHTML } from "../src/comic.js";
import type { Chapter } from "../src/types.js";

const BASE_URL = "https://www.manhuagui.com/comic/123/";

function buildHTML({
  title = "Test Comic",
  sections = [] as { name: string; chapters: Chapter[] }[],
}: {
  title?: string;
  sections?: { name: string; chapters: Chapter[] }[];
} = {}): string {
  const sectionHTML = sections
    .map((s) => {
      const chapterHTML = s.chapters
        .map((c) => {
          const pageInfo = c.pageCount > 0 ? `<i>${c.pageCount}p</i>` : "";
          return `<a href="${c.url}" title="${c.title}"><span>${c.title}${pageInfo}</span></a>`;
        })
        .join("");
      return `<h4><span>${s.name}</span></h4><ul>${chapterHTML}</ul>`;
    })
    .join("");

  return `<html><body>
    <h1>${title}</h1>
    <div class="chapter cf" id="chapterList">
      ${sectionHTML}
    </div><div class="comment"></div>
    </body></html>`;
}

describe("parseChapters", () => {
  it("parses a single chapter link", () => {
    const html =
      '<a href="/comic/123/456.html" title="Chapter 1"><span>Chapter 1<i>20p</i></span></a>';
    const result = parseChapters(html, BASE_URL);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: "Chapter 1",
      url: "https://www.manhuagui.com/comic/123/456.html",
      pageCount: 20,
    });
  });

  it("parses multiple chapter links", () => {
    const html = [
      '<a href="/comic/123/1.html" title="Ch1"><span>Ch1<i>10p</i></span></a>',
      '<a href="/comic/123/2.html" title="Ch2"><span>Ch2<i>15p</i></span></a>',
    ].join("");
    const result = parseChapters(html, BASE_URL);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Ch2");
    expect(result[1].title).toBe("Ch1");
    expect(result[0].pageCount).toBe(15);
    expect(result[1].pageCount).toBe(10);
  });

  it("defaults pageCount to 0 when no page indicator", () => {
    const html = '<a href="/comic/123/1.html" title="Ch1"><span>Ch1</span></a>';
    const result = parseChapters(html, BASE_URL);

    expect(result[0].pageCount).toBe(0);
  });

  it("defaults title to 'Untitled' when title attribute is empty", () => {
    const html = '<a href="/comic/123/1.html" title=""><span>Content</span></a>';
    const result = parseChapters(html, BASE_URL);

    expect(result[0].title).toBe("Untitled");
  });

  it("resolves relative URLs against baseUrl", () => {
    const html = '<a href="456.html" title="Ch"><span>Ch</span></a>';
    const result = parseChapters(html, BASE_URL);

    expect(result[0].url).toBe("https://www.manhuagui.com/comic/123/456.html");
  });

  it("handles absolute URLs", () => {
    const html = '<a href="https://other.example.com/1.html" title="Ch"><span>Ch</span></a>';
    const result = parseChapters(html, BASE_URL);

    expect(result[0].url).toBe("https://other.example.com/1.html");
  });

  it("returns empty array for empty input", () => {
    expect(parseChapters("", BASE_URL)).toEqual([]);
  });

  it("returns empty array for input with no links", () => {
    expect(parseChapters("<div>no links here</div>", BASE_URL)).toEqual([]);
  });
});

describe("parseComicHTML", () => {
  it("extracts title from h1 tag", () => {
    const html = buildHTML({ title: "My Comic" });
    const result = parseComicHTML(html, BASE_URL);

    expect(result.title).toBe("My Comic");
  });

  it('defaults title to "unknown" when h1 is missing', () => {
    const html =
      '<html><body><div class="chapter cf"></div><div class="comment"></div></body></html>';
    const result = parseComicHTML(html, BASE_URL);

    expect(result.title).toBe("unknown");
  });

  it("extracts comic ID from URL", () => {
    const html = buildHTML();
    const result = parseComicHTML(html, "https://www.manhuagui.com/comic/75842/");

    expect(result.id).toBe("75842");
  });

  it('defaults id to "0" when URL has no comic ID pattern', () => {
    const html = buildHTML();
    const result = parseComicHTML(html, "https://example.com/other/page");

    expect(result.id).toBe("0");
  });

  it("parses sections with chapters", () => {
    const html = buildHTML({
      sections: [
        {
          name: "单行本",
          chapters: [
            { title: "第1巻", url: "/comic/123/1.html", pageCount: 200 },
            { title: "第2巻", url: "/comic/123/2.html", pageCount: 180 },
          ],
        },
      ],
    });

    const result = parseComicHTML(html, BASE_URL);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].name).toBe("单行本");
    expect(result.sections[0].chapters).toHaveLength(2);
    expect(result.sections[0].chapters[0].title).toBe("第2巻");
    expect(result.sections[0].chapters[1].title).toBe("第1巻");
  });

  it("parses multiple sections", () => {
    const html = buildHTML({
      sections: [
        {
          name: "Vol 1",
          chapters: [{ title: "Ch1", url: "/comic/123/1.html", pageCount: 10 }],
        },
        {
          name: "Vol 2",
          chapters: [{ title: "Ch2", url: "/comic/123/2.html", pageCount: 20 }],
        },
      ],
    });

    const result = parseComicHTML(html, BASE_URL);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].name).toBe("Vol 1");
    expect(result.sections[1].name).toBe("Vol 2");
  });

  it("returns empty sections when chapter area is missing", () => {
    const html = "<html><body><h1>No chapters</h1></body></html>";
    const result = parseComicHTML(html, BASE_URL);

    expect(result.sections).toEqual([]);
    expect(result.title).toBe("No chapters");
  });

  it("skips sections without a ul element after the header", () => {
    const html = `<html><body>
      <h1>Test</h1>
      <div class="chapter cf">
        <h4><span>Empty Section</span></h4>
        <div>no ul here</div>
        <h4><span>Valid Section</span></h4>
        <ul>
          <a href="/comic/123/1.html" title="Ch"><span>Ch</span></a>
        </ul>
      </div><div class="comment"></div>
    </body></html>`;

    const result = parseComicHTML(html, BASE_URL);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].name).toBe("Valid Section");
  });

  it("parses sections with ul wrapped inside div.chapter-list", () => {
    const html = `<html><body>
      <h1>Test</h1>
      <div class="chapter cf mt16">
        <div class="chapter-bar"><h3>章节全集</h3></div>
        <h4><span>单话</span></h4>
        <div class="chapter-list cf mt10" id="chapter-list-0">
          <ul style="display:block">
            <li><a href="/comic/123/606366.html" title="短篇"><span>短篇<i>11p</i></span></a></li>
          </ul>
        </div>
      </div>
    </body></html>`;

    const result = parseComicHTML(html, BASE_URL);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].name).toBe("单话");
    expect(result.sections[0].chapters).toHaveLength(1);
    expect(result.sections[0].chapters[0].title).toBe("短篇");
    expect(result.sections[0].chapters[0].pageCount).toBe(11);
  });

  it("parses sections with chapter-page pagination div between h4 and chapter-list", () => {
    const html = `<html><body>
      <h1>Test</h1>
      <div class="chapter cf mt16">
        <div class="chapter-bar"><h3>章节全集</h3></div>
        <h4><span>单话</span></h4>
        <div class="chapter-page cf mt10" id="chapter-page-1">
          <ul><li class="on"><a href="javascript:;">1-10</a></li></ul>
        </div>
        <div class="chapter-list cf mt10" id="chapter-list-0">
          <ul style="display:block">
            <li><a href="/comic/123/2.html" title="第02回"><span>第02回<i>31p</i></span></a></li>
            <li><a href="/comic/123/1.html" title="第01回"><span>第01回<i>29p</i></span></a></li>
          </ul>
        </div>
      </div>
    </body></html>`;

    const result = parseComicHTML(html, BASE_URL);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].name).toBe("单话");
    expect(result.sections[0].chapters).toHaveLength(2);
    expect(result.sections[0].chapters[0].title).toBe("第01回");
    expect(result.sections[0].chapters[1].title).toBe("第02回");
  });

  it("collects chapters from all ul elements in paginated chapter-list", () => {
    const html = `<html><body>
      <h1>Test</h1>
      <div class="chapter cf mt16">
        <h4><span>单话</span></h4>
        <div class="chapter-page cf mt10" id="chapter-page-1">
          <ul><li class="on"><a href="javascript:;">1-50</a></li></ul>
        </div>
        <div class="chapter-list cf mt10" id="chapter-list-0">
          <ul>
            <li><a href="/comic/123/2.html" title="第02回"><span>第02回<i>33p</i></span></a></li>
            <li><a href="/comic/123/1.html" title="第01回"><span>第01回<i>29p</i></span></a></li>
          </ul>
          <ul style="display:block">
            <li><a href="/comic/123/5.html" title="第05回"><span>第05回<i>30p</i></span></a></li>
            <li><a href="/comic/123/4.html" title="第04回"><span>第04回<i>29p</i></span></a></li>
            <li><a href="/comic/123/3.html" title="第03回"><span>第03回<i>31p</i></span></a></li>
          </ul>
        </div>
      </div>
    </body></html>`;

    const result = parseComicHTML(html, BASE_URL);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].name).toBe("单话");
    expect(result.sections[0].chapters).toHaveLength(5);
    expect(result.sections[0].chapters.map((c) => c.title)).toEqual([
      "第01回",
      "第02回",
      "第03回",
      "第04回",
      "第05回",
    ]);
  });

  it("returns ComicInfo with id from URL even on minimal HTML", () => {
    const html = buildHTML();
    const result = parseComicHTML(html, BASE_URL);

    expect(result).toEqual({
      title: "Test Comic",
      id: "123",
      sections: [],
    });
  });
});
