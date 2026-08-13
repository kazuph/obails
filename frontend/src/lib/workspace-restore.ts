import { leafPaneIds, type WorkspaceStateSnapshot, type WorkspaceTabSnapshot } from "./workspace-snapshot";

export type WorkspaceLeafRestoreTarget = {
  paneId: string;
  tab: WorkspaceTabSnapshot;
};

/** Returns every visible inactive leaf whose authoritative active tab can be restored. */
export function workspaceLeafRestoreTargets(
  snapshot: WorkspaceStateSnapshot,
  activePaneId: string,
  visiblePaneIds?: ReadonlySet<string>,
): WorkspaceLeafRestoreTarget[] {
  return leafPaneIds(snapshot.paneTree).flatMap((paneId) => {
    if (paneId === activePaneId || (visiblePaneIds && !visiblePaneIds.has(paneId))) return [];
    const pane = snapshot.paneTabs?.find((candidate) => candidate.paneId === paneId);
    const tab = pane?.tabs.find((candidate) => candidate.path === pane.activeTabPath);
    return tab ? [{ paneId, tab }] : [];
  });
}
