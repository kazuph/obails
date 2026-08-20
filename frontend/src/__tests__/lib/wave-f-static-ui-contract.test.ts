import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { describeTreeItem, moveMenuIndex } from "../../lib/accessibility-recovery";

const indexHtml = readFileSync(resolve(__dirname, "../../../index.html"), "utf8");
const tabStripSource = readFileSync(resolve(__dirname, "../../lib/workspace-pane-tab-strip.ts"), "utf8");
const distIndexPath = resolve(__dirname, "../../../dist/index.html");

function parseIndexHtml(source = indexHtml): Document {
  return new DOMParser().parseFromString(source, "text/html");
}

const APPLICATION_DIALOGS = [
  ["image-fullscreen-overlay", "image-fs-title", "Image"],
  ["pdf-fullscreen-overlay", "pdf-fs-title", "PDF"],
  ["mermaid-fullscreen", "mermaid-fullscreen-title", "Mermaid Diagram"],
  ["graph-overlay", "graph-title", "Knowledge Graph"],
  ["move-to-folder-overlay", "move-to-folder-title", "Move to folder"],
  ["broken-link-overlay", "broken-link-title", "Create linked note?"],
  ["quick-switcher-overlay", "quick-switcher-title", "Quick Switcher"],
  ["command-palette-overlay", "command-palette-title", "Command Palette"],
  ["vault-search-overlay", "vault-search-title", "Search vault"],
  ["vault-setup-overlay", "vault-setup-title", "Welcome to Obails"],
  ["delete-confirm-overlay", "delete-confirm-title", "Delete Item?"],
  ["settings-overlay", "settings-title", "Settings"],
  ["recently-deleted-overlay", "recently-deleted-title", "Recently deleted"],
  ["recovery-snapshots-overlay", "recovery-snapshots-title", "Recovery snapshots"],
  ["shortcuts-overlay", "shortcuts-title", "⌨️ Keyboard Shortcuts"],
  ["workspace-save-as-overlay", "workspace-save-as-title", "Save Current Workspace As…"],
  ["workspace-manage-overlay", "workspace-manage-title", "Manage Workspaces"],
] as const;

describe("Wave F static UI contract", () => {
  it("exposes workspace split, save/restore, and popout controls (P-079)", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("split-pane-right-btn")).toBeNull();
    expect(documentRef.getElementById("split-pane-down-btn")).toBeNull();
    expect(tabStripSource).toContain("workspace-pane-split-right");
    expect(tabStripSource).toContain("workspace-pane-split-down");
    expect(documentRef.getElementById("close-pane-btn")).toBeNull();
    expect(documentRef.getElementById("workspace-name")).toBeNull();
    expect(documentRef.getElementById("save-workspace-btn")).toBeNull();
    expect(documentRef.getElementById("restore-workspace-btn")).toBeNull();
    expect(documentRef.getElementById("saved-workspace-names")).toBeNull();
    expect(documentRef.getElementById("popout-pane-btn")?.getAttribute("aria-label")).toBe("Pop out pane");
    expect(documentRef.getElementById("rejoin-popout-btn")?.getAttribute("aria-label")).toBe("Rejoin pane");
    expect(documentRef.getElementById("workspace-host")?.getAttribute("aria-label")).toBe("Workspace");
    expect(documentRef.getElementById("workspace-pane-tabs")?.getAttribute("role")).toBe("tablist");
  });

  it("exposes workspace host and pane tab strip for session restore (P-080)", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("workspace-host")?.classList.contains("workspace-host")).toBe(true);
    expect(documentRef.getElementById("workspace-pane-tabs")?.getAttribute("aria-label")).toBe("Workspace panes");
    expect(documentRef.getElementById("workspace-save-as-title")?.textContent).toBe("Save Current Workspace As…");
    expect(documentRef.getElementById("workspace-save-as-help")?.textContent)
      .toContain("Creates a named snapshot of the current tabs, splits, layout, and popouts");
    expect(documentRef.getElementById("workspace-manage-title")?.textContent).toBe("Manage Workspaces");
    expect(documentRef.getElementById("workspace-manage-help")?.textContent)
      .toContain("Deleting a name does not change the current session");
    expect(documentRef.getElementById("workspace-manage-list")?.getAttribute("aria-label")).toBe("Saved workspaces");
    expect(documentRef.getElementById("rejoin-popout-btn")?.classList.contains("toolbar-labeled-btn")).toBe(true);
  });

  it("exposes explorer sidebar resize and file-tree controls for persisted layout (P-081)", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("sidebar-resize")?.classList.contains("resize-handle")).toBe(true);
    expect(documentRef.getElementById("right-sidebar-resize")?.classList.contains("resize-handle")).toBe(true);
    expect(documentRef.getElementById("file-tree-sort-btn")?.getAttribute("aria-label")).toBe("Sort files");
    expect(documentRef.getElementById("file-tree-fold-toggle-btn")?.getAttribute("aria-label")).toBe("Collapse all folders");
    expect(documentRef.getElementById("file-tree-auto-reveal")?.getAttribute("type")).toBe("checkbox");
    expect(documentRef.getElementById("settings-sidebar-width")?.getAttribute("min")).toBe("150");
    expect(documentRef.getElementById("settings-sidebar-width")?.getAttribute("max")).toBe("500");
  });

  it("exposes file-tree load failure status and retry affordance (P-082)", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("file-tree-status")?.getAttribute("role")).toBe("status");
    expect(documentRef.getElementById("file-tree-status")?.getAttribute("aria-live")).toBe("polite");
    expect(documentRef.getElementById("file-tree-retry")?.textContent).toBe("Retry loading files");
    expect(documentRef.getElementById("file-tree-retry")?.getAttribute("type")).toBe("button");
  });

  it("exposes recoverable settings, theme, and vault-setup failure surfaces (P-083)", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("settings-overlay")?.getAttribute("role")).toBe("dialog");
    expect(documentRef.getElementById("settings-status")?.getAttribute("role")).toBe("status");
    expect(documentRef.getElementById("settings-retry")?.textContent).toBe("Retry settings");
    expect(documentRef.getElementById("settings-theme")?.tagName).toBe("SELECT");
    expect(documentRef.getElementById("vault-setup-overlay")?.getAttribute("role")).toBe("dialog");
    expect(documentRef.getElementById("vault-setup-overlay")?.getAttribute("aria-modal")).toBe("true");
    expect(documentRef.getElementById("vault-setup-title")?.textContent).toBe("Welcome to Obails");
    expect(documentRef.getElementById("vault-setup-btn")?.textContent).toBe("Select Vault Folder");
  });

  it("exposes accessible create-note action outside the tree for empty vaults (P-084)", () => {
    const documentRef = parseIndexHtml();

    const emptyActions = documentRef.getElementById("empty-vault-actions");
    expect(emptyActions?.classList.contains("empty-vault-actions")).toBe(true);
    expect(emptyActions?.hasAttribute("hidden")).toBe(true);
    expect(documentRef.getElementById("empty-vault-create")?.textContent).toBe("Create note");
    expect(documentRef.getElementById("empty-vault-create")?.getAttribute("aria-label"))
      .toBe("Create a note in this empty vault");
    expect(documentRef.getElementById("file-tree")?.contains(documentRef.getElementById("empty-vault-create"))).toBe(false);
  });

  it("defines file-tree hierarchy semantics and treeitem accessibility contract (P-085)", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("file-tree")?.getAttribute("role")).toBe("tree");
    expect(documentRef.getElementById("file-tree")?.getAttribute("aria-label")).toBe("File tree");
    expect(documentRef.getElementById("right-sidebar")?.getAttribute("aria-label")).toBe("Right sidebar");
    expect(documentRef.getElementById("outline-list")?.getAttribute("aria-label")).toBe("Outline headings");
    expect(documentRef.getElementById("outline-list")?.getAttribute("role")).toBe("list");
    expect(describeTreeItem("notes", true, 2, true)).toEqual({
      level: 2,
      label: "Folder: notes",
      expanded: "true",
    });
    expect(describeTreeItem("plan.md", false, 3)).toEqual({ level: 3, label: "File: plan.md" });
    expect(moveMenuIndex(0, 3, "ArrowDown")).toBe(1);
    expect(moveMenuIndex(2, 3, "Home")).toBe(0);
  });

  it("exposes keyboard-operable context menu with menuitem roles (P-086)", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("context-menu")?.getAttribute("role")).toBe("menu");
    expect(documentRef.getElementById("context-menu")?.getAttribute("aria-label")).toBe("File actions");
    const menuItems = Array.from(documentRef.querySelectorAll<HTMLElement>("#context-menu [role='menuitem']"));
    expect(menuItems.length).toBeGreaterThanOrEqual(7);
    for (const item of menuItems) {
      expect(item.getAttribute("tabindex")).toBe("-1");
    }
    expect(documentRef.getElementById("ctx-delete")?.classList.contains("danger")).toBe(true);
    expect(moveMenuIndex(1, 3, "ArrowUp")).toBe(0);
    expect(moveMenuIndex(1, 3, "End")).toBe(2);
  });

  it("exposes keyboard-collapsible outline, outgoing, and backlinks sections (P-087)", () => {
    const documentRef = parseIndexHtml();

    for (const section of ["outline", "outgoing", "backlinks"] as const) {
      const toggle = documentRef.querySelector(`[data-sidebar-section-toggle='${section}']`);
      expect(toggle?.getAttribute("aria-expanded")).toBe("true");
      expect(toggle?.getAttribute("aria-controls")).toBe(`${section === "outgoing" ? "outgoing-links" : section}-list`);
      expect(documentRef.getElementById(`${section === "outgoing" ? "outgoing-links" : section}-list`)
        ?.classList.contains("sidebar-section-body")).toBe(true);
    }
    expect(documentRef.getElementById("right-sidebar")?.classList.contains("right-sidebar")).toBe(true);
    expect(documentRef.getElementById("outline-resize")?.classList.contains("resize-handle")).toBe(true);
  });

  it("exposes application dialogs with modal semantics and labelled titles (P-088)", () => {
    const documentRef = parseIndexHtml();

    for (const [id, labelId, title] of APPLICATION_DIALOGS) {
      const dialog = documentRef.getElementById(id);
      expect(dialog?.getAttribute("role")).toBe("dialog");
      expect(dialog?.getAttribute("aria-modal")).toBe("true");
      expect(dialog?.getAttribute("aria-labelledby")).toBe(labelId);
      expect(documentRef.getElementById(labelId)?.textContent).toBe(title);
    }
    expect(documentRef.getElementById("delete-confirm-cancel")?.textContent).toBe("Cancel");
    expect(documentRef.getElementById("settings-close")?.textContent).toBe("Done");
  });

  it("exposes live operation status, retry, and rename affordance for note title (P-091)", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("operation-status")?.getAttribute("role")).toBe("status");
    expect(documentRef.getElementById("operation-status")?.getAttribute("aria-live")).toBe("polite");
    expect(documentRef.getElementById("operation-retry")?.textContent).toBe("Retry last operation");
    expect(documentRef.getElementById("editor-title")?.getAttribute("role")).toBe("button");
    expect(documentRef.getElementById("editor-title")?.getAttribute("tabindex")).toBe("-1");
    expect(documentRef.getElementById("editor-title")?.hasAttribute("hidden")).toBe(true);
    expect(documentRef.getElementById("editor-title")?.getAttribute("aria-label")).toBe("Rename current note");
    expect(documentRef.getElementById("save-status")?.getAttribute("role")).toBe("status");
  });

  it("retains Wave F contract markers in production dist when built", () => {
    expect(existsSync(distIndexPath)).toBe(true);

    const distHtml = readFileSync(distIndexPath, "utf8");
    const documentRef = parseIndexHtml(distHtml);

    expect(distHtml).toContain("Retry loading files");
    expect(distHtml).toContain("Retry last operation");
    expect(distHtml).toContain("Create a note in this empty vault");
    expect(distHtml).toContain("Rename current note");
    expect(distHtml).toContain("Workspace panes");
    expect(distHtml).toContain("Rejoin pane");
    expect(distHtml).toContain("Save Current Workspace As…");
    expect(distHtml).toContain("Manage Workspaces");
    expect(documentRef.getElementById("workspace-name")).toBeNull();
    expect(documentRef.getElementById("save-workspace-btn")).toBeNull();
    expect(documentRef.getElementById("file-tree")?.getAttribute("role")).toBe("tree");
    expect(documentRef.getElementById("context-menu")?.getAttribute("role")).toBe("menu");
    expect(documentRef.getElementById("settings-retry")?.textContent).toBe("Retry settings");
    expect(documentRef.getElementById("operation-status")?.getAttribute("role")).toBe("status");
    expect(documentRef.getElementById("vault-setup-overlay")?.getAttribute("aria-modal")).toBe("true");
    expect(documentRef.querySelector("[data-sidebar-section-toggle='backlinks']")?.getAttribute("aria-controls"))
      .toBe("backlinks-list");
  });

  it("pops out the active pane through the backend snapshot and never dumps raw JSON errors", () => {
    const source = readFileSync(resolve(__dirname, "../../main.ts"), "utf8");
    const start = source.indexOf("async function createActivePanePopout()");
    const end = source.indexOf("async function rejoinCurrentPopout()");
    const fn = source.slice(start, end);

    expect(fn).toContain("WindowService.CreatePopout");
    expect(fn).toContain("adoptBackendSnapshot");
    expect(fn).toContain("openActiveWorkspaceTab");
    expect(fn).toContain("describeHumanOperationError");
    expect(fn).toContain("the new window could not be opened");
    expect(fn).not.toMatch(/Could not pop out this pane: \$\{describeOperationError/);
    expect(fn).not.toContain("cannot pop out the final visible workspace pane");
  });

  it("disables per-pane close from the remaining visible main-window panes, not the full tree", () => {
    const source = readFileSync(resolve(__dirname, "../../main.ts"), "utf8");
    const start = source.indexOf("function applyWorkspaceSnapshot");
    const end = source.indexOf("function applyPopoutToolbarMode");
    const fn = source.slice(start, end);

    expect(fn).toContain("visibleLeafPaneIds(snapshot.paneTree, snapshot.popoutWindows)");
    expect(fn).toContain("renderWorkspacePaneTabs(snapshot, visiblePaneIds.length)");
    expect(fn).not.toContain("closePaneButton");

    const tabsStart = source.indexOf("function renderWorkspacePaneTabs");
    const tabsFn = source.slice(tabsStart, source.indexOf("async function activateWorkspacePaneFromUi"));
    expect(tabsFn).toContain("paneCloseAffordance");
    expect(tabsFn).toContain("closePane: (targetPaneId) => void closeWorkspacePaneFromUi(targetPaneId)");
    expect(tabsFn).not.toContain("closePaneButton");
  });

  it("keeps the legacy surface owner stable and clears only the active pane", () => {
    const source = readFileSync(resolve(__dirname, "../../main.ts"), "utf8");
    const assignStart = source.indexOf("function assignInitialLegacySurface");
    const assignEnd = source.indexOf("function renderWorkspaceLayout");
    const assignFn = source.slice(assignStart, assignEnd);
    expect(assignFn).toContain("bindLegacyPaneId");
    expect(assignFn).not.toContain("paneSurfaces.delete(snapshot.activePaneId)");
    expect(assignFn).not.toContain("legacySurfacePaneId = snapshot.activePaneId");

    const splitStart = source.indexOf("async function splitActiveWorkspacePane");
    const splitEnd = source.indexOf("async function closeActiveWorkspacePane");
    expect(source.slice(splitStart, splitEnd)).toContain("openActiveWorkspaceTab");
    expect(source.slice(splitStart, splitEnd)).not.toContain("showEmptyMainPane");

    const closeStart = source.indexOf("async function closeWorkspacePaneFromUi");
    const closeEnd = source.indexOf("function getPopoutRoute");
    const closeFn = source.slice(closeStart, closeEnd);
    expect(closeFn).toContain("capturedClosePaneId");
    expect(closeFn).toContain("dataset.activePaneId");
    expect(closeFn).toContain("closePane(paneId)");
    expect(closeFn).toContain("describeHumanOperationError");
    expect(closeFn).toContain("LAST_VISIBLE_PANE_CLOSE_REASON");
    expect(closeFn).not.toMatch(/Could not close this pane: \$\{describeOperationError/);

    const activateStart = source.indexOf("async function activateWorkspacePaneFromUi");
    const activateFn = source.slice(activateStart, source.indexOf("async function activateWorkspaceTabFromUi"));
    expect(activateFn).toContain("document.documentElement.dataset.activePaneId = paneId");

    const renderStart = source.indexOf("function renderWorkspaceLayout");
    const renderFn = source.slice(renderStart, source.indexOf("function activeRichSurface"));
    expect(renderFn).toContain("activateWorkspacePaneFromUi(node.paneId)");
    expect(renderFn).toContain("slot.dataset.active");

    const applyStart = source.indexOf("function applyWorkspaceSnapshot");
    const applyFn = source.slice(applyStart, source.indexOf("function applyPopoutToolbarMode"));
    expect(applyFn).toContain("previousActivePaneId");
    expect(applyFn).toContain("focusWorkspacePane");
    expect(applyFn).toContain("document.documentElement.dataset.activePaneId");

    const openStart = source.indexOf("async function openActiveWorkspaceTab");
    const openEnd = source.indexOf("async function restoreWorkspaceLeafTabs");
    expect(source.slice(openStart, openEnd)).toContain("showEmptyForActivePane");
    expect(source.slice(openStart, openEnd)).not.toContain("showEmptyMainPane");
    const emptyStart = source.indexOf("function showEmptyForPane");
    const emptyFn = source.slice(emptyStart, source.indexOf("function hideRichSurfaceViewers"));
    expect(emptyFn).toContain("createEmptyPaneBody");
    expect(emptyFn).not.toContain("editorTitle.textContent");
    expect(emptyFn).not.toContain("EMPTY_PANE_INSTRUCTION");
    const emptyBodySource = readFileSync(resolve(__dirname, "../../lib/workspace-pane-empty-body.ts"), "utf8");
    expect(emptyBodySource).toContain("EMPTY_PANE_INSTRUCTION");

    const iconsStart = source.indexOf("function setupToolbarIcons");
    const iconsFn = source.slice(iconsStart, source.indexOf("function toStateKey"));
    expect(tabStripSource).toContain('"split-right"');
    expect(tabStripSource).toContain('"split-down"');
    expect(iconsFn).not.toContain("close-pane-btn");
    expect(iconsFn).not.toMatch(/split-pane-right-btn.*page-single/);
  });
});
