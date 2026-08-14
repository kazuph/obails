import { describe, expect, it } from "vitest";
import {
  bindLegacyPaneId,
  capturedClosePaneId,
  EMPTY_PANE_INSTRUCTION,
  factorySurfacePaneIds,
  otherPaneTabsUnchanged,
  shouldClearLegacyEditor,
} from "../../lib/workspace-pane-identity";

describe("workspace pane identity", () => {
  it("binds the legacy surface once and never steals it when the active pane changes", () => {
    expect(bindLegacyPaneId({
      assigned: false,
      currentLegacyPaneId: "main",
      paneIds: ["main"],
      snapshotActivePaneId: "main",
    })).toBe("main");
    expect(bindLegacyPaneId({
      assigned: true,
      currentLegacyPaneId: "main",
      paneIds: ["main", "pane-new"],
      snapshotActivePaneId: "pane-new",
    })).toBe("main");
    expect(factorySurfacePaneIds(["main", "pane-new"], "main")).toEqual(["pane-new"]);
  });

  it("clears the shared legacy editor only when that pane is the active empty surface", () => {
    expect(shouldClearLegacyEditor("pane-new", "main", true)).toBe(false);
    expect(shouldClearLegacyEditor("pane-new", "main", false)).toBe(false);
    expect(shouldClearLegacyEditor("main", "main", false)).toBe(true);
  });

  it("treats close as an exact-pane removal that leaves sibling tabs untouched", () => {
    const before = [
      { paneId: "main", tabs: [{ path: "notes/one.md", fileType: "markdown" }], activeTabPath: "notes/one.md" },
      { paneId: "empty", tabs: [] },
    ];
    const after = [before[0]];
    expect(otherPaneTabsUnchanged(before, after, "empty")).toBe(true);
    expect(otherPaneTabsUnchanged(before, [{ ...before[0], tabs: [] }], "empty")).toBe(false);
  });

  it("captures the visual active pane for the toolbar close handler", () => {
    expect(capturedClosePaneId("right", "right")).toBe("right");
    expect(capturedClosePaneId("right", "left")).toBe("right");
    expect(capturedClosePaneId("", "left")).toBe("left");
    expect(capturedClosePaneId("right", "left")).not.toBe("left");
  });

  it("exports the empty-pane instruction for Explorer open", () => {
    expect(EMPTY_PANE_INSTRUCTION).toBe("Open a note from Explorer");
  });
});
