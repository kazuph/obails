import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRichSurface, hideLegacyRichSurfaceNoteTitles } from "../../lib/rich-surface-factory";
import { createWorkspacePaneTabStrip } from "../../lib/workspace-pane-tab-strip";
import { rewriteWorkspaceTabsAfterMove, defaultWorkspaceState, findPaneTabs, setPaneTab, splitPane } from "../../lib/workspace-state";
import { rewritePaneSidebarCachePath } from "../../lib/pane-sidebar-state";
import { installFilenameInputKeyboard } from "../../lib/composition-submit-guard";

function visibleNoteNameNodes(root: ParentNode, name: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("*")]
    .filter((node) => node.childNodes.length > 0 && [...node.childNodes].every((child) => child.nodeType === Node.TEXT_NODE))
    .filter((node) => (node.textContent || "").trim() === name)
    .filter((node) => !node.hidden && node.getAttribute("hidden") === null);
}

function dispatchBrowserDoubleClick(target: HTMLElement) {
  const fire = (type: string, detail: number) => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, detail }));
  };
  fire("click", 1);
  fire("click", 2);
  fire("dblclick", 2);
}

function tabActions(operations: string[]) {
  return {
    activateTab: (paneId: string, path: string) => operations.push(`activate:${paneId}:${path}`),
    closeTab: (paneId: string, path: string) => operations.push(`close:${paneId}:${path}`),
    renameTab: (paneId: string, path: string) => operations.push(`rename:${paneId}:${path}`),
  };
}

function mountIndexedLegacyEditor(name: string): { slot: HTMLElement; root: HTMLElement } {
  const parsed = new DOMParser().parseFromString(
    readFileSync(resolve(__dirname, "../../../index.html"), "utf8"),
    "text/html",
  );
  const editorContainer = parsed.querySelector(".editor-container");
  if (!editorContainer) throw new Error("index.html is missing .editor-container");
  const imported = document.importNode(editorContainer, true) as HTMLElement;
  const slot = document.createElement("section");
  slot.className = "workspace-pane-slot";
  const strip = createWorkspacePaneTabStrip(document, "pane-a", {
    paneId: "pane-a",
    tabs: [{ path: `notes/${name}.md`, fileType: "markdown" }],
    activeTabPath: `notes/${name}.md`,
  }, "pane-a", () => name, tabActions([]));
  const root = document.createElement("section");
  root.className = "rich-surface legacy-rich-surface";
  root.append(imported);
  slot.append(strip, root);
  document.body.append(slot);
  return { slot, root };
}

describe("workspace pane note title and rename identity", () => {
  it("shows the filename once for factory and initial legacy panes while keeping save and find controls", () => {
    const factorySlot = document.createElement("section");
    factorySlot.className = "workspace-pane-slot";
    const factoryStrip = createWorkspacePaneTabStrip(document, "pane-a", {
      paneId: "pane-a",
      tabs: [{ path: "notes/Daily.md", fileType: "markdown" }],
      activeTabPath: "notes/Daily.md",
    }, "pane-a", () => "Daily", tabActions([]));
    const surface = createRichSurface(document, "pane-a");
    surface.editorTitle.textContent = "Daily";
    surface.previewTitle.textContent = "Daily";
    factorySlot.append(factoryStrip, surface.root);
    document.body.append(factorySlot);

    const factoryTitles = [...factoryStrip.querySelectorAll<HTMLElement>(".workspace-pane-tab-title")];
    expect(factoryTitles.map((title) => title.textContent)).toEqual(["Daily"]);
    expect(surface.editorTitle.hidden).toBe(true);
    expect(surface.previewTitle.hidden).toBe(true);
    expect(surface.editorTitle.classList.contains("standalone-note-title")).toBe(true);
    expect(surface.previewTitle.classList.contains("standalone-note-title")).toBe(true);
    expect(visibleNoteNameNodes(factorySlot, "Daily")).toEqual(factoryTitles);
    expect(visibleNoteNameNodes(factorySlot, "Daily")).toHaveLength(1);
    expect(surface.markdownSaveConflict.status.getAttribute("role")).toBe("status");
    expect(surface.savePulse.classList.contains("save-pulse")).toBe(true);
    expect(surface.noteSearchInput.getAttribute("aria-label")).toBe("Find in note");
    expect(factoryStrip.querySelector("[data-pane-action='source-toggle']")?.getAttribute("aria-label")).toBe("Toggle Source");
    factorySlot.remove();

    const { slot: legacySlot, root: legacyRoot } = mountIndexedLegacyEditor("Daily");
    const editorTitle = legacyRoot.querySelector<HTMLElement>("#editor-title")!;
    const previewTitle = legacyRoot.querySelector<HTMLElement>("#preview-title")!;
    editorTitle.hidden = false;
    previewTitle.hidden = false;
    editorTitle.removeAttribute("hidden");
    previewTitle.removeAttribute("hidden");
    editorTitle.tabIndex = 0;
    editorTitle.textContent = "Daily";
    previewTitle.textContent = "Daily";
    expect(visibleNoteNameNodes(legacySlot, "Daily").length).toBeGreaterThan(1);
    hideLegacyRichSurfaceNoteTitles(legacyRoot);
    const legacyTitles = [...legacySlot.querySelectorAll<HTMLElement>(".workspace-pane-tab-title")];
    expect(legacyTitles.map((title) => title.textContent)).toEqual(["Daily"]);
    expect(editorTitle.hidden).toBe(true);
    expect(previewTitle.hidden).toBe(true);
    expect(editorTitle.tabIndex).toBe(-1);
    expect(visibleNoteNameNodes(legacySlot, "Daily")).toEqual(legacyTitles);
    expect(visibleNoteNameNodes(legacySlot, "Daily")).toHaveLength(1);
    expect(legacyRoot.querySelector(".save-pulse")).not.toBeNull();
    expect(legacyRoot.querySelector("#save-status")?.getAttribute("role")).toBe("status");
    expect(legacyRoot.querySelector("#note-search-input")?.getAttribute("aria-label")).toBe("Find in note");
    legacySlot.remove();
  });

  it("uses a title click+dblclick sequence for activate+rename and a close sequence that closes once", () => {
    const operations: string[] = [];
    const strip = createWorkspacePaneTabStrip(document, "pane-a", {
      paneId: "pane-a",
      tabs: [
        { path: "notes/Old Name.md", fileType: "markdown" },
        { path: "notes/Other.md", fileType: "markdown" },
      ],
      activeTabPath: "notes/Old Name.md",
    }, "pane-a", (path) => path.replace(/^notes\//, "").replace(/\.md$/, ""), tabActions(operations));
    const [firstTab, secondTab] = [...strip.querySelectorAll<HTMLElement>(".workspace-pane-tab")];
    const firstTitle = firstTab.querySelector<HTMLButtonElement>(".workspace-pane-tab-title")!;
    const firstClose = firstTab.querySelector<HTMLButtonElement>(".workspace-pane-tab-close")!;
    const secondTitle = secondTab.querySelector<HTMLButtonElement>(".workspace-pane-tab-title")!;

    dispatchBrowserDoubleClick(secondTitle);
    expect(operations).toEqual([
      "activate:pane-a:notes/Other.md",
      "rename:pane-a:notes/Other.md",
    ]);

    dispatchBrowserDoubleClick(firstClose);
    expect(operations).toEqual([
      "activate:pane-a:notes/Other.md",
      "rename:pane-a:notes/Other.md",
      "close:pane-a:notes/Old Name.md",
    ]);
    expect(operations.filter((entry) => entry.startsWith("close:")).length).toBe(1);
    expect(operations.filter((entry) => entry.startsWith("rename:")).length).toBe(1);

    firstTitle.click();
    expect(operations.at(-1)).toBe("activate:pane-a:notes/Old Name.md");
  });

  it("replaces the same tab record after rename and keeps tab count, order, and sibling tabs", () => {
    const split = splitPane(defaultWorkspaceState("left"), "left", "horizontal", "right");
    const opened = setPaneTab(
      setPaneTab(
        setPaneTab(split, "left", { path: "notes/Old Name.md", fileType: "markdown" }),
        "left",
        { path: "notes/Keep.md", fileType: "markdown" },
      ),
      "right",
      { path: "notes/Old Name.md", fileType: "markdown" },
    );
    const beforeLeft = findPaneTabs(opened, "left")!;
    const beforeRight = findPaneTabs(opened, "right")!;
    const renamed = rewriteWorkspaceTabsAfterMove(opened, "notes/Old Name.md", "notes/New Name.md", false);
    const left = findPaneTabs(renamed, "left")!;
    const right = findPaneTabs(renamed, "right")!;

    expect(left.tabs).toHaveLength(beforeLeft.tabs.length);
    expect(right.tabs).toHaveLength(beforeRight.tabs.length);
    expect(left.tabs.map((tab) => tab.path)).toEqual(["notes/New Name.md", "notes/Keep.md"]);
    expect(right.tabs.map((tab) => tab.path)).toEqual(["notes/New Name.md"]);
    expect(left.tabs.map((tab) => tab.fileType)).toEqual(["markdown", "markdown"]);
    expect(left.activeTabPath).toBe("notes/Keep.md");
    expect(right.activeTabPath).toBe("notes/New Name.md");
    expect(renamed.activePaneId).toBe(opened.activePaneId);
    expect(left.tabs.some((tab) => tab.path === "notes/Old Name.md")).toBe(false);
  });

  it("rewrites descendant tabs in place after a folder move without appending new records", () => {
    const state = setPaneTab(
      setPaneTab(defaultWorkspaceState("pane"), "pane", { path: "notes/Old/a.md", fileType: "markdown" }),
      "pane",
      { path: "notes/Old/img.png", fileType: "image" },
    );
    const rewritten = rewriteWorkspaceTabsAfterMove(state, "notes/Old", "archive/New", true);
    const pane = findPaneTabs(rewritten, "pane")!;
    expect(pane.tabs).toHaveLength(2);
    expect(pane.tabs).toEqual([
      { path: "archive/New/a.md", fileType: "markdown" },
      { path: "archive/New/img.png", fileType: "image" },
    ]);
    expect(pane.activeTabPath).toBe("archive/New/img.png");
  });

  it("keeps sidebar cache contents when only the path identity is rewritten", () => {
    const current = {
      path: "notes/Old Name.md",
      content: "draft",
      backlinks: ["from.md"],
      mentions: [],
      outgoing: ["to.md"],
      preparing: false,
    };
    expect(rewritePaneSidebarCachePath(current, "notes/Old Name.md", "notes/New Name.md", false)).toEqual({
      ...current,
      path: "notes/New Name.md",
    });
    expect(rewritePaneSidebarCachePath(current, "other.md", "nope.md", false)).toBe(current);
  });

  it("does not rewrite Markdown H1 when renaming a file identity", () => {
    const source = readFileSync(resolve(__dirname, "../../main.ts"), "utf8");
    const start = source.indexOf("async function createNewNote()");
    const end = source.indexOf("// Context Menu");
    const renameFn = source.slice(start, end);
    const renameBranch = renameFn.slice(renameFn.indexOf("const nextPath = buildRenamePath"));
    expect(renameBranch).toContain("FileService.MoveFile");
    expect(renameBranch).toContain("updateCurrentPathsAfterMove");
    expect(renameBranch).not.toMatch(/extractHeadings|replaceFirstHeading|syncHeading|rewriteHeading|SaveNote|CreateFile/);
  });

  it("submits rename only on Enter after compositionend, never during IME confirmation", () => {
    const input = document.createElement("input");
    input.id = "new-note-input";
    document.body.append(input);
    const submits: string[] = [];
    const keyboard = installFilenameInputKeyboard(input, {
      submit: () => submits.push(`submit:${input.value}`),
      cancel: () => submits.push("cancel"),
    });

    input.value = "新しい名前";
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "あ" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
    expect(submits).toEqual([]);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true, cancelable: true }));
    expect(submits).toEqual([]);

    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "新しい名前" }));
    const leftover = new KeyboardEvent("keydown", { key: "Enter", isComposing: false, bubbles: true, cancelable: true });
    input.dispatchEvent(leftover);
    expect(submits).toEqual([]);
    expect(leftover.defaultPrevented).toBe(false);

    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    const afterIme = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input.dispatchEvent(afterIme);
    expect(submits).toEqual(["submit:新しい名前"]);
    expect(afterIme.defaultPrevented).toBe(true);

    input.remove();
    keyboard.detach();
  });

  it("does not cancel rename on Escape during IME composition; cancels only after compositionend", () => {
    const input = document.createElement("input");
    input.id = "new-note-input";
    document.body.append(input);
    const events: string[] = [];
    const keyboard = installFilenameInputKeyboard(input, {
      submit: () => events.push("submit"),
      cancel: () => events.push("cancel"),
    });

    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "あ" }));
    const composingEscape = new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true, cancelable: true });
    input.dispatchEvent(composingEscape);
    expect(events).toEqual([]);
    expect(composingEscape.defaultPrevented).toBe(false);

    const imeKeyCodeEscape = new KeyboardEvent("keydown", { key: "Escape", keyCode: 229, bubbles: true, cancelable: true });
    input.dispatchEvent(imeKeyCodeEscape);
    expect(events).toEqual([]);
    expect(imeKeyCodeEscape.defaultPrevented).toBe(false);

    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "新しい名前" }));
    const afterImeEscape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    input.dispatchEvent(afterImeEscape);
    expect(events).toEqual(["cancel"]);
    expect(afterImeEscape.defaultPrevented).toBe(true);

    input.remove();
    keyboard.detach();
  });

  it("clears composition state on cancel, close, and reopen so a later Enter can submit", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const submits: string[] = [];
    const keyboard = installFilenameInputKeyboard(input, {
      submit: () => submits.push("submit"),
      cancel: () => {
        keyboard.reset();
        submits.push("cancel");
      },
    });

    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true, cancelable: true }));
    expect(submits).toEqual([]);

    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(submits).toEqual(["cancel"]);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(submits).toEqual(["cancel", "submit"]);

    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    keyboard.reset();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(submits).toEqual(["cancel", "submit", "submit"]);

    input.remove();
    keyboard.detach();
  });

  it("locks the initial legacy pane to the same hidden title helper and never copies filename onto preview", () => {
    const source = readFileSync(resolve(__dirname, "../../main.ts"), "utf8");
    const mountStart = source.indexOf("function mountLegacyRichSurface()");
    const mountEnd = source.indexOf("function ensurePaneSurface");
    const mountFn = source.slice(mountStart, mountEnd);
    expect(mountFn).toContain("hideLegacyRichSurfaceNoteTitles");

    const titlesStart = source.indexOf("function updatePaneTitles(title: string)");
    const titlesEnd = source.indexOf("async function updateCurrentPathsAfterMove");
    const titlesFn = source.slice(titlesStart, titlesEnd);
    expect(titlesFn).not.toMatch(/previewTitle\.textContent = title/);
    expect(titlesFn).toContain("Preview");
  });
});
