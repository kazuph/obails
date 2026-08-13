import { describe, expect, it } from "vitest";
import { closePane, closePaneTab, defaultWorkspaceState, findPaneTabs, leafPaneIds, normalizeWorkspaceState, resolveWindowDimensions, rewriteWorkspaceTabsAfterMove, setPaneTab, splitPane } from "../../lib/workspace-state";

describe("workspace state", () => {
  it("keeps each pane's tab list independent across a horizontal split", () => {
    const split = splitPane(defaultWorkspaceState("left"), "left", "horizontal", "right");
    const withBoth = setPaneTab(setPaneTab(split, "left", { path: "left.md", fileType: "markdown" }), "right", { path: "right.md", fileType: "markdown" });
    expect(leafPaneIds(withBoth.paneTree)).toEqual(["left", "right"]);
    expect(findPaneTabs(withBoth, "left")?.activeTabPath).toBe("left.md");
    expect(findPaneTabs(withBoth, "right")?.activeTabPath).toBe("right.md");
  });

  it("closes one tab without removing another pane's document", () => {
    const split = splitPane(defaultWorkspaceState("left"), "left", "vertical", "bottom");
    const state = setPaneTab(setPaneTab(split, "left", { path: "one.md", fileType: "markdown" }), "bottom", { path: "two.md", fileType: "markdown" });
    const next = closePaneTab(state, "left", "one.md");
    expect(findPaneTabs(next, "left")?.tabs).toEqual([]);
    expect(findPaneTabs(next, "bottom")?.tabs).toEqual([{ path: "two.md", fileType: "markdown" }]);
  });

  it("collapses a split when its pane is closed", () => {
    const next = closePane(splitPane(defaultWorkspaceState("left"), "left", "vertical", "bottom"), "bottom");
    expect(leafPaneIds(next.paneTree)).toEqual(["left"]);
    expect(next.paneTree).toEqual({ paneId: "left" });
  });

  it("keeps saved layouts when the active workspace has not been initialized", () => {
    const state = normalizeWorkspaceState({ savedWorkspaces: [{ name: "Writing", layout: {} }] });
    expect(state.savedWorkspaces?.map((workspace) => workspace.name)).toEqual(["Writing"]);
    expect(leafPaneIds(state.paneTree)).toHaveLength(1);
  });

  it("does not create duplicate paths when a file type is refined", () => {
    const unknown = setPaneTab(defaultWorkspaceState("pane"), "pane", { path: "note.md", fileType: "other" });
    const refined = setPaneTab(unknown, "pane", { path: "note.md", fileType: "markdown" });
    expect(findPaneTabs(refined, "pane")?.tabs).toEqual([{ path: "note.md", fileType: "markdown" }]);
  });

  it("rewrites a renamed tab in place instead of appending a second record", () => {
    const opened = setPaneTab(
      setPaneTab(defaultWorkspaceState("pane"), "pane", { path: "old.md", fileType: "markdown" }),
      "pane",
      { path: "keep.md", fileType: "markdown" },
    );
    const rewritten = rewriteWorkspaceTabsAfterMove(opened, "old.md", "new.md", false);
    expect(findPaneTabs(rewritten, "pane")?.tabs).toEqual([
      { path: "new.md", fileType: "markdown" },
      { path: "keep.md", fileType: "markdown" },
    ]);
    expect(findPaneTabs(rewritten, "pane")?.activeTabPath).toBe("keep.md");
  });

  it("uses positive WebView dimensions when native outer dimensions are unavailable", () => {
    expect(resolveWindowDimensions(0, 0, 1199, 799)).toEqual({ width: 1199, height: 799 });
    expect(resolveWindowDimensions(1200, 800, 1199, 799)).toEqual({ width: 1200, height: 800 });
    expect(resolveWindowDimensions(0, 0, 0, 799)).toBeNull();
  });
});
