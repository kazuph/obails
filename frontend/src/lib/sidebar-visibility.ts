export type SidebarVisibility = {
  sharedVisible: boolean;
};

/** The single global sidebar is visible only for the active markdown runtime. */
export function sidebarVisibilityForActivePane(
  _activePaneId: string,
  _legacyPaneId: string,
  activeDocumentKind: string | null | undefined,
): SidebarVisibility {
  return {
    sharedVisible: activeDocumentKind === "markdown",
  };
}

export function applySidebarVisibility(
  sidebar: HTMLElement,
  resizeHandle: HTMLElement,
  visibility: SidebarVisibility,
): void {
  const display = visibility.sharedVisible ? "flex" : "none";
  sidebar.style.display = display;
  resizeHandle.style.display = visibility.sharedVisible ? "block" : "none";
}
