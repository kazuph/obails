import { toHtml } from "@mizchi/markdown";

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
  const html = toHtml(content);
  return convertWikiLinks(html);
}
