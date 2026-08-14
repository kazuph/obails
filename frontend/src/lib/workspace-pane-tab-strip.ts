import type { WorkspacePaneTabsSnapshot } from "./workspace-snapshot";
import { EMPTY_PANE_INSTRUCTION } from "./workspace-pane-identity";

export type WorkspacePaneTabActions = {
  activateTab: (paneId: string, path: string) => void;
  closeTab: (paneId: string, path: string) => void;
  renameTab: (paneId: string, path: string) => void;
  activatePane?: (paneId: string) => void;
};

export function createWorkspacePaneTabStrip(
  documentRef: Document,
  paneId: string,
  pane: WorkspacePaneTabsSnapshot | undefined,
  activePaneId: string,
  displayName: (path: string) => string,
  actions: WorkspacePaneTabActions,
): HTMLElement {
  const strip = documentRef.createElement("section");
  strip.className = "workspace-pane-tabs workspace-pane-tab-group";
  strip.dataset.paneId = paneId;
  // Use group (not tablist): WebKit hides non-tab siblings under role=tablist, which
  // dropped Close * buttons from the macOS accessibility tree and blocked AX close.
  strip.setAttribute("role", "group");
  strip.setAttribute("aria-label", `Tabs in pane ${paneId}`);
  strip.addEventListener("pointerdown", () => {
    actions.activatePane?.(paneId);
  });
  for (const tab of pane?.tabs ?? []) {
    const selected = paneId === activePaneId && pane?.activeTabPath === tab.path;
    const tabChrome = documentRef.createElement("div");
    tabChrome.className = "workspace-pane-tab";
    tabChrome.dataset.path = tab.path;
    tabChrome.setAttribute("aria-selected", String(selected));

    const title = documentRef.createElement("button");
    title.type = "button";
    title.className = "workspace-pane-tab-title";
    title.setAttribute("aria-pressed", String(selected));
    const name = displayName(tab.path);
    title.setAttribute("aria-label", `Tab ${name}`);
    title.title = name;
    title.tabIndex = selected ? 0 : -1;
    title.textContent = name;
    title.addEventListener("click", (event) => {
      if (event.detail > 1) return;
      actions.activateTab(paneId, tab.path);
    });
    title.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      actions.renameTab(paneId, tab.path);
    });

    const closeButton = documentRef.createElement("button");
    closeButton.type = "button";
    closeButton.className = "workspace-pane-tab-close";
    const closeLabel = `Close ${displayName(tab.path)} in ${paneId}`;
    // Visible × text (not icon-only) so macOS AX exposes a real AXButton title.
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", closeLabel);
    closeButton.title = closeLabel;
    closeButton.dataset.path = tab.path;
    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail > 1) return;
      actions.closeTab(paneId, tab.path);
    });
    closeButton.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    tabChrome.append(title, closeButton);
    strip.append(tabChrome);
  }
  if (!pane?.tabs.length) {
    const empty = documentRef.createElement("span");
    empty.className = "workspace-pane-empty";
    empty.textContent = EMPTY_PANE_INSTRUCTION;
    empty.setAttribute("role", "button");
    empty.tabIndex = 0;
    empty.setAttribute("aria-label", `Empty pane. ${EMPTY_PANE_INSTRUCTION}`);
    empty.title = `Empty pane. ${EMPTY_PANE_INSTRUCTION}`;
    empty.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        actions.activatePane?.(paneId);
      }
    });
    strip.append(empty);
  }
  return strip;
}
