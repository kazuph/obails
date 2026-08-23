import { getDisplayName, type ItemKind } from "./file-tree-ops";

export type NoteCountTreeNode = {
  isDir: boolean;
  fileType?: string;
  path?: string;
  children?: NoteCountTreeNode[] | null;
};

function hasHiddenPathSegment(path: string): boolean {
  return path.replaceAll("\\", "/").split("/").some((segment) => segment.startsWith(".") && segment.length > 1);
}

/** Counts only visible Markdown notes below a file-tree node. */
export function countMarkdownNotes(node: NoteCountTreeNode): number {
  if (hasHiddenPathSegment(node.path || "")) return 0;
  if (!node.isDir) {
    if ((node.fileType || "").toLowerCase() === "markdown") return 1;
    return (node.path || "").toLowerCase().endsWith(".md") ? 1 : 0;
  }
  return (node.children ?? []).reduce((total, child) => total + countMarkdownNotes(child), 0);
}

export function appendFileTreeItemContent(
  item: HTMLElement,
  iconMarkup: string,
  path: string,
  kind: ItemKind,
  audio: boolean,
): void {
  const icon = document.createElement("span");
  icon.className = "folder-icon";
  // Icons come only from the application's fixed icon library.
  icon.innerHTML = iconMarkup;
  const name = document.createElement("span");
  name.className = "file-name";
  name.textContent = getDisplayName(path, kind);
  item.append(icon, name);
  if (audio) {
    const badge = document.createElement("span");
    badge.className = "file-playback-badge";
    badge.dataset.playbackBadge = "";
    badge.hidden = true;
    item.appendChild(badge);
  }
}
