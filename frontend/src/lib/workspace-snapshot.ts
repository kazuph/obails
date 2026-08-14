export type WorkspaceTabSnapshot = {
  path: string;
  fileType: string;
};

export type WorkspacePaneTabsSnapshot = {
  paneId: string;
  tabs: ReadonlyArray<WorkspaceTabSnapshot>;
  activeTabPath?: string;
};

export type WorkspacePaneTreeSnapshot = {
  paneId?: string;
  splitDirection?: "horizontal" | "vertical";
  children?: ReadonlyArray<WorkspacePaneTreeSnapshot>;
  weights?: ReadonlyArray<number>;
};

export type WorkspacePopoutSnapshot = {
  id: string;
  paneId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorkspaceStateSnapshot = {
  activePaneId: string;
  paneTree: WorkspacePaneTreeSnapshot;
  paneTabs?: ReadonlyArray<WorkspacePaneTabsSnapshot>;
  popoutWindows?: ReadonlyArray<WorkspacePopoutSnapshot>;
  savedWorkspaces?: ReadonlyArray<{ name: string; layout: unknown }>;
  activeNamedWorkspace?: string;
};

export function leafPaneIds(tree: WorkspacePaneTreeSnapshot | null | undefined): string[] {
  if (!tree) return [];
  if (typeof tree.paneId === "string" && tree.paneId.length > 0) return [tree.paneId];
  return (tree.children ?? []).flatMap(leafPaneIds);
}

export function visibleLeafPaneIds(
  tree: WorkspacePaneTreeSnapshot | null | undefined,
  popoutWindows?: ReadonlyArray<{ paneId: string }> | null,
): string[] {
  const hidden = new Set((popoutWindows ?? []).map((popout) => popout.paneId));
  return leafPaneIds(tree).filter((paneId) => !hidden.has(paneId));
}

export function isWorkspaceStateSnapshot(value: unknown): value is WorkspaceStateSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<WorkspaceStateSnapshot>;
  if (!validateWorkspaceLayout(snapshot, true, true)) return false;
  if (snapshot.savedWorkspaces === undefined) return snapshot.activeNamedWorkspace === undefined || snapshot.activeNamedWorkspace === "";
  if (!Array.isArray(snapshot.savedWorkspaces)) return false;
  const names = new Set<string>();
  const savedOk = snapshot.savedWorkspaces.every((workspace) => {
    if (!workspace || !isExactId(workspace.name) || names.has(workspace.name)) return false;
    names.add(workspace.name);
    return validateWorkspaceLayout(workspace.layout, false, false);
  });
  if (!savedOk) return false;
  if (snapshot.activeNamedWorkspace === undefined || snapshot.activeNamedWorkspace === "") return true;
  return isExactId(snapshot.activeNamedWorkspace) && names.has(snapshot.activeNamedWorkspace);
}

function validateWorkspaceLayout(value: unknown, requirePaneTree: boolean, requireCompleteTabs: boolean): boolean {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<WorkspaceStateSnapshot>;
  const paneIds = layout.paneTree === undefined || layout.paneTree === null ? null : validatePaneTree(layout.paneTree);
  if (requirePaneTree && !paneIds) return false;
  if (!paneIds) {
    return (layout.activePaneId === undefined || layout.activePaneId === "")
      && (!layout.paneTabs || layout.paneTabs.length === 0)
      && (!layout.popoutWindows || validatePopouts(layout.popoutWindows));
  }
  if (!isExactId(layout.activePaneId) || !paneIds.has(layout.activePaneId)) return false;
  const paneTabs = layout.paneTabs ?? [];
  if (!Array.isArray(paneTabs)) return false;
  const tabPaneIds = new Set<string>();
  for (const pane of paneTabs) {
    if (!pane || !isExactId(pane.paneId) || !paneIds.has(pane.paneId) || tabPaneIds.has(pane.paneId) || !Array.isArray(pane.tabs)) return false;
    tabPaneIds.add(pane.paneId);
    const paths = new Set<string>();
    for (const tab of pane.tabs) {
      if (!tab || typeof tab.path !== "string" || tab.path.length === 0 || !isExactId(tab.fileType) || paths.has(tab.path)) return false;
      paths.add(tab.path);
    }
    if ((pane.tabs.length === 0 && pane.activeTabPath !== undefined && pane.activeTabPath !== "") || (pane.tabs.length > 0 && !paths.has(pane.activeTabPath ?? ""))) return false;
  }
  if ((requireCompleteTabs || paneTabs.length > 0) && (tabPaneIds.size !== paneIds.size || [...paneIds].some((paneId) => !tabPaneIds.has(paneId)))) return false;
  return layout.popoutWindows === undefined || validatePopouts(layout.popoutWindows, paneIds);
}

function validatePaneTree(tree: unknown): Set<string> | null {
  if (!tree || typeof tree !== "object") return null;
  const node = tree as WorkspacePaneTreeSnapshot;
  if (typeof node.paneId === "string") {
    return isExactId(node.paneId) && node.children === undefined && node.splitDirection === undefined && node.weights === undefined
      ? new Set([node.paneId])
      : null;
  }
  if ((node.splitDirection !== "horizontal" && node.splitDirection !== "vertical") || !Array.isArray(node.children) || node.children.length < 2 || (node.weights !== undefined && (!Array.isArray(node.weights) || (node.weights.length !== 0 && node.weights.length !== node.children.length)))) {
    return null;
  }
  const paneIds = new Set<string>();
  for (let index = 0; index < node.children.length; index += 1) {
    if (node.weights?.length && (!Number.isFinite(node.weights[index]) || node.weights[index] <= 0)) return null;
    const childPaneIds = validatePaneTree(node.children[index]);
    if (!childPaneIds) return null;
    for (const paneId of childPaneIds) {
      if (paneIds.has(paneId)) return null;
      paneIds.add(paneId);
    }
  }
  return paneIds;
}

function validatePopouts(popouts: ReadonlyArray<WorkspacePopoutSnapshot>, paneIds?: ReadonlySet<string>): boolean {
  const ids = new Set<string>();
  const detachedPaneIds = new Set<string>();
  return popouts.every((popout) => {
    if (!popout || !isExactId(popout.id) || !isExactId(popout.paneId) || (paneIds && !paneIds.has(popout.paneId)) || ids.has(popout.id) || detachedPaneIds.has(popout.paneId)) {
      return false;
    }
    if (![popout.x, popout.y, popout.width, popout.height].every(Number.isFinite) || popout.width <= 0 || popout.height <= 0) return false;
    ids.add(popout.id);
    detachedPaneIds.add(popout.paneId);
    return true;
  });
}

function isExactId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}
