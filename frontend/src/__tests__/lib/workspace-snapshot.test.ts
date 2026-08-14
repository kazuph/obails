import { describe, expect, it } from "vitest";
import { isWorkspaceStateSnapshot, visibleLeafPaneIds } from "../../lib/workspace-snapshot";

describe("workspace snapshot validation", () => {
  it("accepts an operational current workspace with omitted split weights", () => {
    expect(isWorkspaceStateSnapshot({
      paneTree: { splitDirection: "horizontal", children: [{ paneId: "left" }, { paneId: "right" }] },
      activePaneId: "right",
      paneTabs: [{ paneId: "left", tabs: [] }, { paneId: "right", tabs: [] }],
    })).toBe(true);
  });

  it("rejects an operational current workspace that omits a pane tab record", () => {
    expect(isWorkspaceStateSnapshot({
      paneTree: { paneId: "main" },
      activePaneId: "main",
      paneTabs: [],
    })).toBe(false);
  });

  it("accepts a generic persisted saved layout that remains non-operational until restore", () => {
    expect(isWorkspaceStateSnapshot({
      paneTree: { paneId: "main" },
      activePaneId: "main",
      paneTabs: [{ paneId: "main", tabs: [] }],
      savedWorkspaces: [{
        name: "partial",
        layout: { paneTree: { paneId: "saved" }, activePaneId: "saved" },
      }],
    })).toBe(true);
  });

  it("accepts a selected named workspace only when that name is saved", () => {
    expect(isWorkspaceStateSnapshot({
      paneTree: { paneId: "main" },
      activePaneId: "main",
      paneTabs: [{ paneId: "main", tabs: [] }],
      savedWorkspaces: [{ name: "Writing", layout: { paneTree: { paneId: "saved" }, activePaneId: "saved" } }],
      activeNamedWorkspace: "Writing",
    })).toBe(true);
    expect(isWorkspaceStateSnapshot({
      paneTree: { paneId: "main" },
      activePaneId: "main",
      paneTabs: [{ paneId: "main", tabs: [] }],
      savedWorkspaces: [{ name: "Writing", layout: { paneTree: { paneId: "saved" }, activePaneId: "saved" } }],
      activeNamedWorkspace: "Missing",
    })).toBe(false);
  });

  it("counts only main-window panes after native popouts hide their leaves", () => {
    expect(visibleLeafPaneIds(
      { splitDirection: "horizontal", children: [{ paneId: "main" }, { paneId: "side" }] },
      [{ paneId: "main" }],
    )).toEqual(["side"]);
    expect(visibleLeafPaneIds(
      { splitDirection: "horizontal", children: [{ paneId: "main" }, { paneId: "empty" }] },
      [{ paneId: "main" }],
    )).toEqual(["empty"]);
    expect(visibleLeafPaneIds({ paneId: "main" }, [{ paneId: "main" }])).toEqual([]);
  });
});
