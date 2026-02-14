import { toHtml } from "@mizchi/markdown";

const FRONT_MATTER_PATTERN =
  /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractFrontMatter(content: string): { block: string; body: string } {
  const match = content.match(FRONT_MATTER_PATTERN);
  if (!match || match[0].length === 0) {
    return { block: "", body: content };
  }

  return {
    block: match[1],
    body: content.slice(match[0].length),
  };
}

type FrontMatterCell = {
  key: string;
  values: string[];
};

function splitFrontMatterRows(block: string): FrontMatterCell[] {
  const rows: FrontMatterCell[] = [];
  const lines = block.split(/\r?\n/);
  let current: FrontMatterCell | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const listMatch = /^(\s+)-\s*(.*)$/.exec(line);
    if (listMatch && current) {
      current.values.push(listMatch[2]);
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const key = line.slice(0, colonIndex).trim();
    if (!key) {
      continue;
    }

    const value = line.slice(colonIndex + 1).trim();
    current = { key, values: value ? [value] : [] };
    rows.push(current);
  }

  return rows;
}

function renderFrontMatter(block: string): string {
  const rows = splitFrontMatterRows(block);
  if (rows.length === 0) {
    return `<pre><code class="language-yaml">${escapeHtml(block.trim())}</code></pre>`;
  }

  const rowsHtml = rows
    .map((row) => {
      const valueHtml = row.values.length
        ? row.values.map((value) => escapeHtml(value)).join("<br />")
        : "";

      return `<tr><td class="frontmatter-key">${escapeHtml(row.key)}</td><td class="frontmatter-value">${valueHtml}</td></tr>`;
    })
    .join("");

    return `
    <div class="frontmatter-table-wrap">
      <table class="frontmatter-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

/**
 * Converts wiki-style links [[link]] or [[link|alias]] to HTML spans
 */
export function convertWikiLinks(html: string): string {
  return html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, alias) => {
    const displayText = alias || link;
    return `<span class="wiki-link" data-link="${link}">${displayText}</span>`;
  });
}

/**
 * Parses markdown content to HTML with wiki-link support
 */
export function parseMarkdown(content: string): string {
  const { block, body } = extractFrontMatter(content);
  const trimmedBody = body.replace(/^\r?\n+/, "");
  const frontMatterHtml = block
    ? `<section class="frontmatter"><details class="frontmatter-details"><summary class="frontmatter-summary" aria-label="Toggle metadata"><span class="frontmatter-summary-label">Metadata</span><span class="frontmatter-summary-icon" aria-hidden="true"></span></summary>${renderFrontMatter(block)}</details></section>`
    : "";
  const html = `${frontMatterHtml}${toHtml(trimmedBody)}`;
  return convertWikiLinks(html);
}
