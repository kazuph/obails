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
});

describe("renderOutlineHTML", () => {
  it("should render empty string for empty headings", () => {
    const result = renderOutlineHTML([]);
    expect(result).toBe("");
  });

  it("should render heading with correct class and data-line", () => {
    const headings: Heading[] = [{ level: 2, text: "Test Heading", line: 5 }];
    const result = renderOutlineHTML(headings);
    expect(result).toContain('class="outline-item h2"');
    expect(result).toContain('data-line="5"');
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
});
