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
});
