import type { WorkspacePaneTabsSnapshot } from "./workspace-snapshot";
import { renderIcon } from "./icons";
import {
  CLOSE_PANE_LABEL,
  EMPTY_PANE_TAB_LABEL,
  LAST_VISIBLE_PANE_CLOSE_REASON,
  closeTabLabel,
  type PaneCloseAffordance,
} from "./workspace-pane-identity";

export type WorkspacePaneTabActions = {
  activateTab: (paneId: string, path: string) => void;
  closeTab: (paneId: string, path: string) => void;
  renameTab: (paneId: string, path: string) => void;
  activatePane?: (paneId: string) => void;
  closePane?: (paneId: string) => void;
  toggleSource?: (paneId: string) => void;
  splitPaneRight?: (paneId: string) => void;
  splitPaneDown?: (paneId: string) => void;
};

export type WorkspacePaneTabStripOptions = {
  paneClose?: PaneCloseAffordance;
  sourceVisible?: boolean;
  splitControls?: "visible" | "hidden";
};

function paneActionButton(
  documentRef: Document,
  className: string,
  icon: "code" | "split-right" | "split-down",
  label: string,
): HTMLButtonElement {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = `workspace-pane-action ${className}`;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = renderIcon(icon);
  return button;
}

export function createWorkspacePaneTabStrip(
  documentRef: Document,
  paneId: string,
  pane: WorkspacePaneTabsSnapshot | undefined,
  activePaneId: string,
  displayName: (path: string) => string,
  actions: WorkspacePaneTabActions,
  options: WorkspacePaneTabStripOptions = {},
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
  const tabList = documentRef.createElement("div");
  tabList.className = "workspace-pane-tab-list";
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
    const closeLabel = closeTabLabel(displayName(tab.path), paneId);
    // Visible × text (not icon-only) so macOS AX exposes a real AXButton title.
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", closeLabel);
    closeButton.title = closeLabel;
    closeButton.dataset.path = tab.path;
    closeButton.dataset.close = "tab";
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
    tabList.append(tabChrome);
  }
  if (!pane?.tabs.length) {
    const selected = paneId === activePaneId;
    const tabChrome = documentRef.createElement("div");
    tabChrome.className = "workspace-pane-tab";
    tabChrome.dataset.empty = "true";
    tabChrome.setAttribute("aria-selected", String(selected));

    const title = documentRef.createElement("button");
    title.type = "button";
    title.className = "workspace-pane-tab-title";
    title.setAttribute("aria-pressed", String(selected));
    title.setAttribute("aria-label", EMPTY_PANE_TAB_LABEL);
    title.title = EMPTY_PANE_TAB_LABEL;
    title.tabIndex = selected ? 0 : -1;
    title.textContent = EMPTY_PANE_TAB_LABEL;
    title.addEventListener("click", (event) => {
      if (event.detail > 1) return;
      actions.activatePane?.(paneId);
    });

    tabChrome.append(title);
    const paneClose = options.paneClose ?? "enabled";
    if (paneClose !== "hidden") {
      const closeButton = documentRef.createElement("button");
      closeButton.type = "button";
      closeButton.className = "workspace-pane-tab-close";
      closeButton.dataset.close = "pane";
      closeButton.textContent = "×";
      const enabled = paneClose === "enabled";
      const closeLabel = enabled ? CLOSE_PANE_LABEL : LAST_VISIBLE_PANE_CLOSE_REASON;
      closeButton.setAttribute("aria-label", closeLabel);
      closeButton.title = closeLabel;
      closeButton.disabled = !enabled;
      if (!enabled) closeButton.setAttribute("aria-disabled", "true");
      closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.detail > 1 || closeButton.disabled) return;
        actions.closePane?.(paneId);
      });
      closeButton.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      tabChrome.append(closeButton);
    }
    tabList.append(tabChrome);
  }
  const actionCluster = documentRef.createElement("div");
  actionCluster.className = "workspace-pane-actions";
  const sourceToggle = paneActionButton(documentRef, "workspace-pane-source-toggle", "code", "Toggle Source");
  sourceToggle.dataset.paneAction = "source-toggle";
  sourceToggle.setAttribute("aria-pressed", options.sourceVisible ? "true" : "false");
  sourceToggle.classList.toggle("active", Boolean(options.sourceVisible));
  sourceToggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    actions.toggleSource?.(paneId);
  });
  actionCluster.append(sourceToggle);
  if (options.splitControls !== "hidden") {
    const splitRight = paneActionButton(documentRef, "workspace-pane-split-right", "split-right", "Split pane right");
    splitRight.dataset.paneAction = "split-right";
    splitRight.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      actions.splitPaneRight?.(paneId);
    });
    const splitDown = paneActionButton(documentRef, "workspace-pane-split-down", "split-down", "Split pane down");
    splitDown.dataset.paneAction = "split-down";
    splitDown.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      actions.splitPaneDown?.(paneId);
    });
    actionCluster.append(splitRight, splitDown);
  }
  strip.append(tabList, actionCluster);
  return strip;
}
