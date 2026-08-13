import { rewritePathAfterMove } from "./file-tree-ops";

export type PaneSidebarCache<Backlink, Mention, Outgoing> = {
  path: string;
  content: string;
  backlinks: Backlink[] | null;
  mentions: Mention[] | null;
  outgoing: Outgoing[] | null;
  preparing: boolean;
};

export function updatePaneSidebarCache<Backlink, Mention, Outgoing>(
  previous: PaneSidebarCache<Backlink, Mention, Outgoing> | undefined,
  path: string,
  content: string,
): PaneSidebarCache<Backlink, Mention, Outgoing> {
  if (previous?.path === path) return { ...previous, content };
  return { path, content, backlinks: null, mentions: null, outgoing: null, preparing: true };
}

export function rewritePaneSidebarCachePath<Backlink, Mention, Outgoing>(
  cache: PaneSidebarCache<Backlink, Mention, Outgoing>,
  previousPath: string,
  nextPath: string,
  isDir: boolean,
): PaneSidebarCache<Backlink, Mention, Outgoing> {
  const path = rewritePathAfterMove(cache.path, previousPath, nextPath, isDir);
  if (!path || path === cache.path) return cache;
  return { ...cache, path };
}
