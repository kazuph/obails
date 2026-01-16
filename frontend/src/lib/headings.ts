/**
 * Represents a heading extracted from markdown content
 */
export interface Heading {
  /** Heading level (1-6) */
  level: number;
  /** Heading text content */
  text: string;
  /** Line number (0-indexed) */
  line: number;
}

/**
 * Extracts markdown headings from content
 * @param content - The markdown content to parse
 * @returns Array of heading objects with level, text, and line number
 */
export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: index,
      });
    }
  });

  return headings;
}

/**
 * Generates HTML for outline items
 * @param headings - Array of headings
 * @returns HTML string for the outline
 */
export function renderOutlineHTML(headings: Heading[]): string {
  return headings
    .map(
      (h) => `
        <div class="outline-item h${h.level}" data-line="${h.line}">
            ${h.text}
        </div>
    `
    )
    .join("");
}
