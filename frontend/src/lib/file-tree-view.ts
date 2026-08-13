import { getDisplayName, type ItemKind } from "./file-tree-ops";

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
