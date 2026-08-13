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

const MAX_HEADING_LEVEL = 6;
const MAX_BLOCK_INDENT = 3;
const MIN_FENCE_LENGTH = 3;

type CodeFence = {
  marker: "`" | "~";
  length: number;
};

type ParagraphCandidate = {
  line: number;
  text: string[];
};

/**
 * Extracts markdown headings from content
 * @param content - The markdown content to parse
 * @returns Array of heading objects with level, text, and line number
 */
export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const allLines = content.split("\n");
  let lineOffset = 0;
  let lines = allLines;
  if (allLines[0]?.replace(/\r$/, "") === "---") {
    for (let index = 1; index < allLines.length; index += 1) {
      if (allLines[index].replace(/\r$/, "") === "---") {
        lineOffset = index + 1;
        lines = allLines.slice(lineOffset);
        break;
      }
    }
  }
  let codeFence: CodeFence | null = null;
  let inlineCodeDelimiterLength = 0;
  let paragraph: ParagraphCandidate | null = null;

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.replace(/\r$/, "");

    if (codeFence) {
      if (isClosingFence(line, codeFence)) {
        codeFence = null;
      }
      paragraph = null;
      continue;
    }

    const openingFence = getOpeningFence(line);
    if (openingFence) {
      codeFence = openingFence;
      paragraph = null;
      continue;
    }

    if (inlineCodeDelimiterLength) {
      if (hasInlineCodeDelimiter(line, inlineCodeDelimiterLength)) {
        inlineCodeDelimiterLength = 0;
      }
      paragraph = null;
      continue;
    }

    const atxHeading = getAtxHeading(line);
    if (atxHeading) {
      headings.push({ ...atxHeading, line: index + lineOffset });
      paragraph = null;
      continue;
    }

    const setextLevel = getSetextLevel(line);
    if (setextLevel && paragraph) {
      headings.push({
        level: setextLevel,
        text: paragraph.text.join(" ").trim(),
        line: paragraph.line + lineOffset,
      });
      paragraph = null;
      continue;
    }

    const unclosedDelimiterLength = getUnclosedInlineCodeDelimiterLength(line);
    if (unclosedDelimiterLength && hasFutureInlineCodeDelimiter(lines, index + 1, unclosedDelimiterLength)) {
      inlineCodeDelimiterLength = unclosedDelimiterLength;
      paragraph = null;
      continue;
    }

    if (isParagraphLine(line)) {
      if (paragraph) {
        paragraph.text.push(line.trim());
      } else {
        paragraph = { line: index, text: [line.trim()] };
      }
    } else {
      paragraph = null;
    }
  }

  return headings;
}

function getOpeningFence(line: string): CodeFence | null {
  const match = new RegExp(`^ {0,${MAX_BLOCK_INDENT}}(\`+|~+)(.*)$`).exec(line);
  if (!match || match[1].length < MIN_FENCE_LENGTH) {
    return null;
  }
  return { marker: match[1][0] as CodeFence["marker"], length: match[1].length };
}

function isClosingFence(line: string, fence: CodeFence): boolean {
  const match = new RegExp(`^ {0,${MAX_BLOCK_INDENT}}(\`+|~+)[ \\t]*$`).exec(line);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

function getAtxHeading(line: string): Omit<Heading, "line"> | null {
  const match = new RegExp(`^ {0,${MAX_BLOCK_INDENT}}(#{1,${MAX_HEADING_LEVEL}})(?:[ \\t]+(.*)|[ \\t]*)$`).exec(line);
  if (!match) {
    return null;
  }
  const rawText = match[2] || "";
  return { level: match[1].length, text: normalizeAtxHeadingText(rawText) };
}

function normalizeAtxHeadingText(rawText: string): string {
  const trimmed = rawText.trim();
  if (/^#+$/.test(trimmed)) {
    return "";
  }
  return trimmed.replace(/[ \t]+#+[ \t]*$/, "").trim();
}

function getSetextLevel(line: string): number | null {
  const match = new RegExp(`^ {0,${MAX_BLOCK_INDENT}}(=+|-+)[ \\t]*$`).exec(line);
  if (!match) {
    return null;
  }
  return match[1][0] === "=" ? 1 : 2;
}

function isParagraphLine(line: string): boolean {
  if (!line.trim() || /^ {4}|^\t/.test(line)) {
    return false;
  }
  if (new RegExp(`^ {0,${MAX_BLOCK_INDENT}}(?:>|(?:[-+*]|\\d+[.)])[ \\t]+)`).test(line)) {
    return false;
  }
  return !isThematicBreak(line);
}

function isThematicBreak(line: string): boolean {
  const markers = line.replace(new RegExp(`^ {0,${MAX_BLOCK_INDENT}}`), "").replace(/[ \t]/g, "");
  return markers.length >= MIN_FENCE_LENGTH && /^(\*+|-+|_+)$/.test(markers);
}

function getUnclosedInlineCodeDelimiterLength(line: string): number {
  let openDelimiterLength = 0;
  for (const match of line.matchAll(/`+/g)) {
    const delimiterLength = match[0].length;
    if (!openDelimiterLength) {
      openDelimiterLength = delimiterLength;
    } else if (delimiterLength === openDelimiterLength) {
      openDelimiterLength = 0;
    }
  }
  return openDelimiterLength;
}

function hasInlineCodeDelimiter(line: string, delimiterLength: number): boolean {
  return [...line.matchAll(/`+/g)].some((match) => match[0].length === delimiterLength);
}

function hasFutureInlineCodeDelimiter(lines: string[], start: number, delimiterLength: number): boolean {
  return lines.slice(start).some((line) => hasInlineCodeDelimiter(line, delimiterLength));
}

/**
 * Generates HTML for outline items
 * @param headings - Array of headings
 * @returns HTML string for the outline
 */
export function renderOutlineHTML(headings: Heading[]): string {
  return headings
    .map(
      (h, index) => `
        <button type="button" class="outline-item h${h.level}" data-line="${h.line}" data-heading-index="${index}" aria-label="Go to heading: ${escapeHTML(h.text)}">
            ${escapeHTML(h.text)}
        </button>
    `
    )
    .join("");
}

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}
