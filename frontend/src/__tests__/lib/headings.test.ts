import { describe, it, expect } from "vitest";
import {
  extractHeadings,
  renderOutlineHTML,
  type Heading,
} from "../../lib/headings";

describe("extractHeadings", () => {
  it("should extract h1 headings", () => {
    const content = "# Hello World";
    const result = extractHeadings(content);
    expect(result).toEqual([{ level: 1, text: "Hello World", line: 0 }]);
  });

  it("should extract headings of different levels", () => {
    const content = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;
    const result = extractHeadings(content);
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({ level: 1, text: "H1", line: 0 });
    expect(result[1]).toEqual({ level: 2, text: "H2", line: 1 });
    expect(result[2]).toEqual({ level: 3, text: "H3", line: 2 });
    expect(result[3]).toEqual({ level: 4, text: "H4", line: 3 });
    expect(result[4]).toEqual({ level: 5, text: "H5", line: 4 });
    expect(result[5]).toEqual({ level: 6, text: "H6", line: 5 });
  });

  it("should handle content with non-heading lines", () => {
    const content = `Some text
# Heading 1
More text
## Heading 2
Even more text`;
    const result = extractHeadings(content);
    expect(result).toEqual([
      { level: 1, text: "Heading 1", line: 1 },
      { level: 2, text: "Heading 2", line: 3 },
    ]);
  });

  it("should trim whitespace from heading text", () => {
    const content = "#   Heading with spaces   ";
    const result = extractHeadings(content);
    expect(result[0].text).toBe("Heading with spaces");
  });

  it("should return empty array for content without headings", () => {
    const content = "Just regular text\nwithout any headings";
    const result = extractHeadings(content);
    expect(result).toEqual([]);
  });

  it("should not match # without space after it", () => {
    const content = "#NoSpace";
    const result = extractHeadings(content);
    expect(result).toEqual([]);
  });

  it("should not match more than 6 #", () => {
    const content = "####### Not a heading";
    const result = extractHeadings(content);
    expect(result).toEqual([]);
  });

  it("should handle empty content", () => {
    const result = extractHeadings("");
    expect(result).toEqual([]);
  });

  it("should preserve correct line numbers with empty lines", () => {
    const content = `# First

# Second

# Third`;
    const result = extractHeadings(content);
    expect(result).toEqual([
      { level: 1, text: "First", line: 0 },
      { level: 1, text: "Second", line: 2 },
      { level: 1, text: "Third", line: 4 },
    ]);
  });

  it("excludes headings inside fenced and multiline inline code", () => {
    const content = `# Visible
\`\`\`markdown
# Fenced
\`\`\`
\`inline code starts
# Inline
ends here\`
# After code`;

    expect(extractHeadings(content)).toEqual([
      { level: 1, text: "Visible", line: 0 },
      { level: 1, text: "After code", line: 7 },
    ]);
  });

  it("does not suppress headings after an unclosed inline code delimiter", () => {
    const content = "`unclosed inline code\n# Still a heading";

    expect(extractHeadings(content)).toEqual([
      { level: 1, text: "Still a heading", line: 1 },
    ]);
  });

  it("extracts setext and permitted indented ATX headings", () => {
    const content = `Setext level one
===============

  ## Two spaces
   ### Three spaces
    #### Indented code
Setext level two
----------------
    Not a setext heading
    --------------------`;

    expect(extractHeadings(content)).toEqual([
      { level: 1, text: "Setext level one", line: 0 },
      { level: 2, text: "Two spaces", line: 3 },
      { level: 3, text: "Three spaces", line: 4 },
      { level: 2, text: "Setext level two", line: 6 },
    ]);
  });

  it("normalizes optional closing ATX hashes", () => {
    const content = `# Single closing #
## Many closings ###
### Literal hash#`;

    expect(extractHeadings(content)).toEqual([
      { level: 1, text: "Single closing", line: 0 },
      { level: 2, text: "Many closings", line: 1 },
      { level: 3, text: "Literal hash#", line: 2 },
    ]);
  });

  it("does not turn a thematic break into a setext heading", () => {
    expect(extractHeadings("---\n===")).toEqual([]);
  });

  it("skips YAML frontmatter so metadata lines are not outline headings", () => {
    const content = `---
read: false
important: false
source: vault-note.md
---

## 概要

本文です。

### 詳細

- item`;

    expect(extractHeadings(content)).toEqual([
      { level: 2, text: "概要", line: 6 },
      { level: 3, text: "詳細", line: 10 },
    ]);
  });
});

describe("renderOutlineHTML", () => {
  it("should render empty string for empty headings", () => {
    const result = renderOutlineHTML([]);
    expect(result).toBe("");
  });

  it("should render heading with correct class and data-line", () => {
    const headings: Heading[] = [{ level: 2, text: "Test Heading", line: 5 }];
    const result = renderOutlineHTML(headings);
    expect(result).toContain("<button type=\"button\"");
    expect(result).toContain('class="outline-item h2"');
    expect(result).toContain('data-line="5"');
    expect(result).toContain('aria-label="Go to heading: Test Heading"');
    expect(result).toContain("Test Heading");
  });

  it("should render multiple headings", () => {
    const headings: Heading[] = [
      { level: 1, text: "First", line: 0 },
      { level: 2, text: "Second", line: 2 },
    ];
    const result = renderOutlineHTML(headings);
    expect(result).toContain('class="outline-item h1"');
    expect(result).toContain('class="outline-item h2"');
    expect(result).toContain("First");
    expect(result).toContain("Second");
  });

  it("escapes vault-controlled heading text", () => {
    const result = renderOutlineHTML([{ level: 1, text: '<img src=x onerror="alert(1)"> & note', line: 0 }]);

    expect(result).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; note");
    expect(result).not.toContain("<img");
  });
});
