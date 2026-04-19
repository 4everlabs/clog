import { describe, expect, test } from "bun:test";
import { renderMarkdownToHtml } from "../apps/frontends/web/src/markdown";

describe("web markdown renderer", () => {
  test("renders headings as heading elements", () => {
    expect(renderMarkdownToHtml("# Deploy now")).toBe("<h1>Deploy now</h1>");
  });

  test("renders common inline markdown inside paragraphs", () => {
    expect(renderMarkdownToHtml("Ship **fast** with `bun`"))
      .toBe("<p>Ship <strong>fast</strong> with <code>bun</code></p>");
  });

  test("falls back to ascii tables so web matches Telegram behavior", () => {
    const html = renderMarkdownToHtml("| Name | Value |\n| --- | --- |\n| bun | fast |");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("Name");
    expect(html).toContain("Value");
    expect(html).toContain("bun");
    expect(html).toContain("fast");
  });
});
