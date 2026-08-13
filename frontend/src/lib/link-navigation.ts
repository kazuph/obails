import type { QuickSwitcherNote } from "./quick-switcher";
import { extractHeadings } from "./headings";

export type InternalLinkTarget = {
  target: string;
  fragment: string;
  fragmentType: "heading" | "block" | null;
};

export type WikiLinkSuggestion = {
  note: QuickSwitcherNote;
  matchedTerm: string;
  insertTarget: string;
  resolvesAlias: boolean;
};

export function parseInternalLinkTarget(value: string): InternalLinkTarget {
  const trimmed = value.trim();
  const fragmentIndex = trimmed.indexOf("#");
  const target = decodeLinkPart(fragmentIndex === -1 ? trimmed : trimmed.slice(0, fragmentIndex));
  const rawFragment = fragmentIndex === -1 ? "" : decodeLinkPart(trimmed.slice(fragmentIndex + 1));
  const isBlock = rawFragment.startsWith("^");

  return {
    target,
    fragment: isBlock ? rawFragment.slice(1).trim() : rawFragment.trim(),
    fragmentType: rawFragment ? (isBlock ? "block" : "heading") : null,
  };
}

export function getCreatePathForInternalLink(
  target: string,
  sourcePath: string,
  kind: "wikilink" | "markdown",
): string | null {
  const path = target.trim();
  if (!path || path.startsWith("/")) {
    return null;
  }
  const sourceDirectory = kind === "markdown" ? sourcePath.split("/").slice(0, -1) : [];
  const parts = [...sourceDirectory, ...path.split("/")];
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      if (normalized.length === 0) {
        return null;
      }
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  const result = normalized.join("/");
  if (!result) {
    return null;
  }
  return /\.(md|markdown)$/i.test(result) ? result : `${result}.md`;
}

export function getWikiLinkQueryAtCursor(value: string, cursor: number): { start: number; query: string } | null {
  const beforeCursor = value.slice(0, cursor);
  const start = beforeCursor.lastIndexOf("[[");
  if (start === -1 || beforeCursor.lastIndexOf("]]") > start) {
    return null;
  }
  const query = beforeCursor.slice(start + 2);
  if (query.includes("|") || query.includes("#") || query.includes("]") || query.includes("\n")) {
    return null;
  }
  return { start: start + 2, query };
}

export function getWikiLinkSuggestions(notes: QuickSwitcherNote[], query: string): WikiLinkSuggestion[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return notes.map((note) => ({
      note,
      matchedTerm: note.title,
      insertTarget: linkTargetForPath(note.path),
      resolvesAlias: false,
    }));
  }

  return notes.flatMap((note) => {
    const terms = [note.title, note.path.split("/").pop() || note.path, ...note.aliases];
    const matchedTerm = terms.find((term) => normalize(term).includes(normalizedQuery));
    if (!matchedTerm) {
      return [];
    }
    const resolvesAlias = note.aliases.some((alias) => normalize(alias) === normalize(matchedTerm));
    return [{
      note,
      matchedTerm,
      insertTarget: resolvesAlias ? matchedTerm : linkTargetForPath(note.path),
      resolvesAlias,
    }];
  }).sort((left, right) => {
    const leftExact = normalize(left.matchedTerm) === normalizedQuery ? 0 : 1;
    const rightExact = normalize(right.matchedTerm) === normalizedQuery ? 0 : 1;
    return leftExact - rightExact || left.note.path.localeCompare(right.note.path);
  });
}

export function findFragmentLine(content: string, fragment: string, fragmentType: "heading" | "block"): number {
  if (fragmentType === "block") {
    const blockId = escapeRegExp(fragment);
    return content.split("\n").findIndex((line) => new RegExp(`(?:^|\\s)\\^${blockId}(?=\\s|$)`).test(line));
  }

  const normalizedFragment = normalize(fragment);
  return extractHeadings(content).find((heading) => normalize(heading.text) === normalizedFragment)?.line ?? -1;
}

function linkTargetForPath(path: string): string {
  return path.replace(/\.(md|markdown)$/i, "");
}

function decodeLinkPart(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
