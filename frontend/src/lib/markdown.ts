import { toHtml } from "@mizchi/markdown";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractFrontMatter(content: string): { block: string; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match || match[0].length === 0) {
    return { block: "", body: content };
  }

  return {
    block: match[1],
    body: content.slice(match[0].length),
  };
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
  const frontMatterHtml = block
    ? `<pre><code class="language-yaml">${escapeHtml(block.trim())}</code></pre>`
    : "";
  const html = `${frontMatterHtml}${toHtml(body)}`;
  return convertWikiLinks(html);
}
