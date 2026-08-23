export const EMPTY_PANE_INSTRUCTION = "Open a note from Explorer";
export const EMPTY_PANE_TAB_LABEL = "Empty pane";
export const CLOSE_PANE_LABEL = "Close this pane";
export const LAST_VISIBLE_PANE_CLOSE_REASON = "Cannot close the last remaining pane";

export type PaneCloseAffordance = "enabled" | "disabled" | "hidden";

export function closeTabLabel(name: string, paneId: string): string {
  return `Close ${name} in ${paneId}`;
}

export function paneCloseAffordance(options: {
  isPopout: boolean;
  visibleMainPaneCount: number;
}): PaneCloseAffordance {
  if (options.isPopout) return "hidden";
  if (options.visibleMainPaneCount <= 1) return "disabled";
  return "enabled";
}

export function shouldClosePaneWithLastTab(
  tabPaths: ReadonlyArray<string>,
  targetPath: string,
  visibleMainPaneCount: number,
): boolean {
  return visibleMainPaneCount > 1 && tabPaths.length === 1 && tabPaths[0] === targetPath;
}

export function bindLegacyPaneId(options: {
  assigned: boolean;
  currentLegacyPaneId: string;
  paneIds: ReadonlyArray<string>;
  snapshotActivePaneId: string;
}): string {
  if (options.assigned) return options.currentLegacyPaneId;
  if (options.paneIds.includes(options.currentLegacyPaneId)) return options.currentLegacyPaneId;
  if (options.paneIds.includes(options.snapshotActivePaneId)) return options.snapshotActivePaneId;
  return options.paneIds[0] || options.currentLegacyPaneId;
}

export function factorySurfacePaneIds(paneIds: ReadonlyArray<string>, legacyPaneId: string): string[] {
  return paneIds.filter((paneId) => paneId !== legacyPaneId);
}

export function shouldClearLegacyEditor(activePaneId: string, legacyPaneId: string, hasFactorySurface: boolean): boolean {
  return !hasFactorySurface && activePaneId === legacyPaneId;
}

export function otherPaneTabsUnchanged<T extends { paneId: string }>(
  before: ReadonlyArray<T>,
  after: ReadonlyArray<T>,
  closedPaneId: string,
): boolean {
  const remaining = before.filter((pane) => pane.paneId !== closedPaneId);
  if (remaining.length !== after.length) return false;
  return remaining.every((pane, index) => after[index] === pane || JSON.stringify(after[index]) === JSON.stringify(pane));
}

export function capturedClosePaneId(visualPaneId: string, activePaneId: string): string {
  return visualPaneId || activePaneId;
}
