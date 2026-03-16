import { describe, it, expect } from "vitest";
import { convertWikiLinks, parseMarkdown } from "../../lib/markdown";

describe("convertWikiLinks", () => {
  it("should convert simple wiki links", () => {
    const input = "Check out [[my-note]]";
    const result = convertWikiLinks(input);
    expect(result).toBe(
      'Check out <span class="wiki-link" data-link="my-note">my-note</span>'
    );
  });

  it("should convert wiki links with aliases", () => {
    const input = "See [[my-note|My Note]]";
    const result = convertWikiLinks(input);
    expect(result).toBe(
      'See <span class="wiki-link" data-link="my-note">My Note</span>'
    );
  });

  it("should convert multiple wiki links", () => {
    const input = "Links: [[note1]] and [[note2|Note 2]]";
    const result = convertWikiLinks(input);
    expect(result).toBe(
      'Links: <span class="wiki-link" data-link="note1">note1</span> and <span class="wiki-link" data-link="note2">Note 2</span>'
    );
  });

  it("should leave non-wiki-link text unchanged", () => {
    const input = "Regular text without links";
    const result = convertWikiLinks(input);
    expect(result).toBe("Regular text without links");
  });

  it("should handle wiki links with spaces in the link target", () => {
    const input = "[[my note with spaces]]";
    const result = convertWikiLinks(input);
    expect(result).toBe(
      '<span class="wiki-link" data-link="my note with spaces">my note with spaces</span>'
    );
  });

  it("should handle wiki links with special characters", () => {
    const input = "[[note-2024/01/15]]";
    const result = convertWikiLinks(input);
    expect(result).toBe(
      '<span class="wiki-link" data-link="note-2024/01/15">note-2024/01/15</span>'
    );
  });
});

describe("convertWikiLinks - image embeds", () => {
  it("should convert ![[image.png]] to img tag", () => {
    const input = "Here is ![[photo.png]] inline";
    const result = convertWikiLinks(input);
    expect(result).toContain('<img class="vault-image"');
    expect(result).toContain('data-vault-path="photo.png"');
    expect(result).toContain('alt="photo.png"');
  });

  it("should handle ![[image.jpg|alt text]] with alt/size", () => {
    const input = "![[screenshot.jpg|My Screenshot]]";
    const result = convertWikiLinks(input);
    expect(result).toContain('data-vault-path="screenshot.jpg"');
    expect(result).toContain('alt="My Screenshot"');
  });

  it("should handle various image extensions", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]) {
      const input = `![[image.${ext}]]`;
      const result = convertWikiLinks(input);
      expect(result).toContain("vault-image");
      expect(result).toContain(`data-vault-path="image.${ext}"`);
    }
  });

  it("should handle image in subfolder", () => {
    const input = "![[attachments/photo.png]]";
    const result = convertWikiLinks(input);
    expect(result).toContain('data-vault-path="attachments/photo.png"');
  });

  it("should handle image in deep nested path", () => {
    const input = "![[attachment/runway-chase/ebitengine-2d.png]]";
    const result = convertWikiLinks(input);
    expect(result).toContain('class="vault-image"');
    expect(result).toContain('data-vault-path="attachment/runway-chase/ebitengine-2d.png"');
  });

  it("should treat non-image ![[embed]] as wiki-link", () => {
    const input = "![[some-note]]";
    const result = convertWikiLinks(input);
    expect(result).toContain('class="wiki-link"');
    expect(result).toContain('data-link="some-note"');
    expect(result).not.toContain("vault-image");
  });

  it("should not confuse ![[image]] with [[image.png]] (no embed)", () => {
    const input = "[[photo.png]]";
    const result = convertWikiLinks(input);
    expect(result).toContain('class="wiki-link"');
    expect(result).not.toContain("vault-image");
  });
});

describe("parseMarkdown", () => {
  it("should convert markdown to HTML", () => {
    const input = "# Hello";
    const result = parseMarkdown(input);
    expect(result).toContain("<h1");
    expect(result).toContain("Hello");
  });

  it("should convert markdown with wiki links", () => {
    const input = "Check [[my-note]]";
    const result = parseMarkdown(input);
    expect(result).toContain('class="wiki-link"');
    expect(result).toContain('data-link="my-note"');
  });

  it("should convert ![[image.png]] embeds to img tags", () => {
    const input = "# Test\n\n![[attachment/runway-chase/ebitengine-2d.png]]\n\nAfter image";
    const result = parseMarkdown(input);
    expect(result).toContain('<img class="vault-image"');
    expect(result).toContain('data-vault-path="attachment/runway-chase/ebitengine-2d.png"');
    expect(result).toContain("<h1");
    expect(result).toContain("After image");
  });

  it("should handle paragraphs", () => {
    const input = "First paragraph\n\nSecond paragraph";
    const result = parseMarkdown(input);
    expect(result).toContain("<p>");
  });

  it("should handle code blocks", () => {
    const input = "```js\nconst x = 1;\n```";
    const result = parseMarkdown(input);
    expect(result).toContain("<pre>");
    expect(result).toContain("<code");
  });

  it("should render YAML frontmatter block and body", () => {
    const input = `---
title: 家族会話記録
tags:
  - test

---

# 要約
内容`;
    const result = parseMarkdown(input);
    expect(result).toContain('class="frontmatter"');
    expect(result).toContain("Metadata");
    expect(result).toContain("frontmatter-key");
    expect(result).toContain("家族会話記録");
    expect(result).toContain("<h1>要約</h1>");
    expect(result).toContain("<p>内容</p>");
  });

  it("should handle UTF-8 BOM before frontmatter", () => {
    const input = `\uFEFF---
title: BOM付き
---

# 見出し`;
    const result = parseMarkdown(input);
    expect(result).toContain("BOM付き");
    expect(result).toContain("<h1>見出し</h1>");
  });

  it("should handle frontmatter with trailing spaces and CRLF", () => {
    const input = `--- \r
title: CRLF\r
--- \r
\r
# 見出し`;
    const result = parseMarkdown(input);
    expect(result).toContain("CRLF");
    expect(result).toContain("<h1>見出し</h1>");
  });
});
