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
    expect(result).toContain('data-embed-link="wikilink"');
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
    expect(result).toContain('data-embed-link="wikilink"');
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

describe("wiki embeds with special characters", () => {
  it("keeps underscores in image embeds intact", () => {
    const result = parseMarkdown("![[fig1_geometry_3d.png]]");
    expect(result).toContain('data-vault-path="fig1_geometry_3d.png"');
    expect(result).not.toContain("<em>");
  });

  it("keeps underscores in wiki links intact", () => {
    const result = parseMarkdown("[[my_note_v2|表示名]]");
    expect(result).toContain('data-link="my_note_v2"');
    expect(result).toContain("表示名");
  });

  it("does not convert wiki syntax inside code blocks", () => {
    const result = parseMarkdown("```\n![[a_b.png]]\n```");
    expect(result).toContain("![[a_b.png]]");
    expect(result).not.toContain("vault-image");
  });
});

describe("math rendering (KaTeX)", () => {
  it("renders block math with \\tag", () => {
    const result = parseMarkdown("$$\nE = mc^2 \\tag{6}\n$$");
    expect(result).toContain("math-block");
    expect(result).toContain("katex");
  });

  it("renders inline math with subscripts", () => {
    const result = parseMarkdown("これは $a_i^2 + b_j$ です");
    expect(result).toContain("math-inline");
    expect(result).toContain("katex");
    expect(result).not.toContain("<em>");
  });

  it("renders \\(...\\) and \\[...\\] delimiters", () => {
    const result = parseMarkdown("\\(x^2\\) と \\[y_k\\]");
    expect(result).toContain("math-inline");
    expect(result).toContain("math-block");
  });

  it("does not throw on broken latex", () => {
    const result = parseMarkdown("$$\\frac{1}{$$");
    expect(result).toContain("math-block");
  });

  it("leaves inline code with dollars untouched", () => {
    const result = parseMarkdown("コード `$a_b$` です");
    expect(result).toContain("<code>$a_b$</code>");
    expect(result).not.toContain("math-inline");
  });

  it("does not treat currency-like text as math", () => {
    const result = parseMarkdown("価格は $ 100 と $ 200 です");
    expect(result).not.toContain("math-inline");
  });
});

describe("Obsidian callouts", () => {
  it("renders a tip callout with title and markdown body", () => {
    const result = parseMarkdown("> [!tip] ヒントだよ\n> 中身 **強調**");
    expect(result).toContain('data-callout="tip"');
    expect(result).toContain("callout-title");
    expect(result).toContain("ヒントだよ");
    expect(result).toContain("<strong>強調</strong>");
  });

  it("renders [!x]- as a collapsed details element", () => {
    const result = parseMarkdown("> [!question]- 折りたたみ\n> 中身");
    expect(result).toContain('<details class="callout" data-callout="question">');
    expect(result).not.toContain('<details class="callout" data-callout="question" open>');
  });

  it("renders [!x]+ as an expanded details element", () => {
    const result = parseMarkdown("> [!warning]+ 開いてる\n> 中身");
    expect(result).toContain('data-callout="warning" open>');
  });

  it("uses capitalized type as fallback title", () => {
    const result = parseMarkdown("> [!abstract]\n> 概要本文");
    expect(result).toContain('data-callout="abstract"');
    expect(result).toContain("Abstract");
  });

  it("renders math inside callouts", () => {
    const result = parseMarkdown("> [!info] 式\n> $$x_i = 1$$");
    expect(result).toContain('data-callout="info"');
    expect(result).toContain("katex");
  });

  it("keeps plain blockquotes untouched", () => {
    const result = parseMarkdown("> ただの引用");
    expect(result).toContain("<blockquote>");
    expect(result).not.toContain("callout");
  });
});

describe("tables with empty header cells", () => {
  it("renders a table whose first header cell is empty", () => {
    const result = parseMarkdown("| | A | B |\n|---|---|---|\n| x | 1 | 2 |");
    expect(result).toContain("<table>");
    expect(result).toContain("<td>x</td>");
  });

  it("renders a table whose middle header cell is empty", () => {
    const result = parseMarkdown("| A | | B |\n|---|---|---|\n| 1 | x | 2 |");
    expect(result).toContain("<table>");
  });

  it("keeps normal tables working", () => {
    const result = parseMarkdown("| A | B |\n|---|---|\n| 1 | 2 |");
    expect(result).toContain("<table>");
    expect(result).toContain("<th>A</th>");
  });
});

describe("pipeline regression guards", () => {
  it("keeps mermaid code fences for the mermaid renderer", () => {
    const result = parseMarkdown("```mermaid\ngraph TD\nA-->B\n```");
    expect(result).toContain("mermaid");
    expect(result).toContain("A--&gt;B");
  });

  it("keeps headings, lists and bold intact", () => {
    const result = parseMarkdown("# 見出し\n\n- リスト\n- **太字**");
    expect(result).toContain("<h1>見出し</h1>");
    expect(result).toContain("<li>");
    expect(result).toContain("<strong>太字</strong>");
  });

  it("does not leak placeholder tokens", () => {
    const input = [
      "# t",
      "$$x=1$$",
      "$y_i$",
      "![[img_a.png]]",
      "[[note_b]]",
      "> [!tip] t",
      "> $z_k$",
      "```\ncode $a$\n```",
    ].join("\n\n");
    const result = parseMarkdown(input);
    expect(result).not.toMatch(/OBAILSTK/);
  });
});

describe("footnotes", () => {
  it("renders footnote references and definitions", () => {
    const result = parseMarkdown("本文です[^1]\n\n[^1]: 注釈本文");

    expect(result).toContain('class="footnote-ref"');
    expect(result).toContain('href="#fn-1"');
    expect(result).toContain('<section class="footnotes">');
    expect(result).toContain('id="fn-1"');
    expect(result).toContain("注釈本文");
    expect(result).toContain('class="footnote-backref"');
  });

  it("supports markdown inside footnote definitions", () => {
    const result = parseMarkdown("本文[^note]\n\n[^note]: **強調** と $x_i$");

    expect(result).toContain("<strong>強調</strong>");
    expect(result).toContain("math-inline");
  });

  it("does not convert footnotes inside code blocks", () => {
    const result = parseMarkdown("```\n[^1]\n```\n\n[^1]: note");

    expect(result).toContain("[^1]");
    expect(result).not.toContain('id="fnref-1"');
  });
});

describe("unicode math symbols (KaTeX)", () => {
  it("renders ∇ and ≠ inside math mode", () => {
    const result = parseMarkdown("$∇^2 u ≠ ν$");
    expect(result).toContain("math-inline");
    expect(result).toContain("katex");
    expect(result).not.toContain("math-error");
  });
});
