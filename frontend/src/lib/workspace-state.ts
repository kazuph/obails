import { rewritePathAfterMove } from "./file-tree-ops";

export type WorkspaceTab = { path: string; fileType: string };

export type PaneTree = {
  paneId?: string;
  splitDirection?: "horizontal" | "vertical";
  children?: PaneTree[];
  weights?: number[];
};

export type PaneTabs = {
  paneId: string;
  tabs: WorkspaceTab[];
  activeTabPath?: string;
};

export type PopoutWindow = {
  id: string;
  paneId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorkspaceLayout = {
  paneTree?: PaneTree | null;
  paneTabs?: PaneTabs[];
  activePaneId?: string;
  popoutWindows?: PopoutWindow[];
};

export type NamedWorkspace = { name: string; layout: WorkspaceLayout };
export type WorkspaceState = WorkspaceLayout & { savedWorkspaces?: NamedWorkspace[]; activeNamedWorkspace?: string };

export function newPaneId(): string { return `pane-${crypto.randomUUID()}`; }
export function newPopoutId(): string { return `popout-${crypto.randomUUID()}`; }

export function resolveWindowDimensions(
  outerWidth: number,
  outerHeight: number,
  innerWidth: number,
  innerHeight: number,
): { width: number; height: number } | null {
  const width = Math.trunc(outerWidth > 0 && Number.isFinite(outerWidth) ? outerWidth : innerWidth);
  const height = Math.trunc(outerHeight > 0 && Number.isFinite(outerHeight) ? outerHeight : innerHeight);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height }
    : null;
}

export function defaultWorkspaceState(paneId = newPaneId()): WorkspaceState {
  return { paneTree: { paneId }, paneTabs: [{ paneId, tabs: [] }], activePaneId: paneId, popoutWindows: [], savedWorkspaces: [] };
}

export function cloneLayout(state: WorkspaceLayout): WorkspaceLayout {
  return structuredClone({ paneTree: state.paneTree ?? null, paneTabs: state.paneTabs ?? [], activePaneId: state.activePaneId ?? "", popoutWindows: state.popoutWindows ?? [] });
}

export function normalizeWorkspaceState(state: WorkspaceState | null | undefined): WorkspaceState {
  if (!state?.paneTree || !state.paneTabs?.length) {
    return { ...defaultWorkspaceState(), savedWorkspaces: structuredClone(state?.savedWorkspaces ?? []) };
  }
  const normalized = structuredClone(state) as WorkspaceState;
  normalized.popoutWindows ??= [];
  normalized.savedWorkspaces ??= [];
  normalized.paneTabs ??= [];
  normalized.activePaneId ||= normalized.paneTabs[0]?.paneId || newPaneId();
  return normalized;
}

export function findPaneTabs(state: WorkspaceLayout, paneId: string): PaneTabs | undefined {
  return state.paneTabs?.find((pane) => pane.paneId === paneId);
}

export function leafPaneIds(tree: PaneTree | null | undefined): string[] {
  if (!tree) return [];
  if (tree.paneId) return [tree.paneId];
  return (tree.children ?? []).flatMap(leafPaneIds);
}

function replaceLeaf(tree: PaneTree, paneId: string, replacement: PaneTree): PaneTree {
  if (tree.paneId === paneId) return replacement;
  return { ...tree, children: tree.children?.map((child) => replaceLeaf(child, paneId, replacement)) };
}

export function splitPane(state: WorkspaceState, paneId: string, direction: "horizontal" | "vertical", newPaneIdValue = newPaneId()): WorkspaceState {
  const next = normalizeWorkspaceState(state);
  if (!next.paneTree || !findPaneTabs(next, paneId)) return next;
  next.paneTree = replaceLeaf(next.paneTree, paneId, { splitDirection: direction, children: [{ paneId }, { paneId: newPaneIdValue }], weights: [1, 1] });
  next.paneTabs!.push({ paneId: newPaneIdValue, tabs: [] });
  next.activePaneId = newPaneIdValue;
  return next;
}

export function setPaneTab(state: WorkspaceState, paneId: string, tab: WorkspaceTab): WorkspaceState {
  const next = normalizeWorkspaceState(state);
  const pane = findPaneTabs(next, paneId);
  if (!pane) return next;
  const existing = pane.tabs.find((entry) => entry.path === tab.path);
  if (existing) existing.fileType = tab.fileType;
  else pane.tabs.push(tab);
  pane.activeTabPath = tab.path;
  next.activePaneId = paneId;
  return next;
}

export function rewriteWorkspaceTabsAfterMove(
  state: WorkspaceState,
  previousPath: string,
  nextPath: string,
  isDir: boolean,
): WorkspaceState {
  const next = normalizeWorkspaceState(state);
  for (const pane of next.paneTabs ?? []) {
    const seen = new Set<string>();
    const tabs: WorkspaceTab[] = [];
    for (const tab of pane.tabs) {
      const path = rewritePathAfterMove(tab.path, previousPath, nextPath, isDir) || tab.path;
      if (seen.has(path)) continue;
      seen.add(path);
      tabs.push({ ...tab, path });
    }
    pane.tabs = tabs;
    const active = rewritePathAfterMove(pane.activeTabPath || null, previousPath, nextPath, isDir);
    pane.activeTabPath = active && seen.has(active) ? active : tabs.at(-1)?.path;
  }
  return next;
}

export function closePaneTab(state: WorkspaceState, paneId: string, path: string): WorkspaceState {
  const next = normalizeWorkspaceState(state);
  const pane = findPaneTabs(next, paneId);
  if (!pane) return next;
  pane.tabs = pane.tabs.filter((tab) => tab.path !== path);
  if (pane.activeTabPath === path) pane.activeTabPath = pane.tabs.at(-1)?.path;
  return next;
}

function removeLeaf(tree: PaneTree, paneId: string): PaneTree | null {
  if (tree.paneId === paneId) return null;
  const children = (tree.children ?? []).map((child) => removeLeaf(child, paneId)).filter((child): child is PaneTree => child !== null);
  if (!tree.children) return tree;
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...tree, children, weights: children.map(() => 1) };
}

export function closePane(state: WorkspaceState, paneId: string): WorkspaceState {
  const next = normalizeWorkspaceState(state);
  if (leafPaneIds(next.paneTree).length <= 1 || !next.paneTree) return next;
  next.paneTree = removeLeaf(next.paneTree, paneId);
  next.paneTabs = next.paneTabs!.filter((pane) => pane.paneId !== paneId);
  next.popoutWindows = next.popoutWindows!.filter((popout) => popout.paneId !== paneId);
  if (next.activePaneId === paneId) next.activePaneId = next.paneTabs[0]?.paneId || "";
  return next;
}
