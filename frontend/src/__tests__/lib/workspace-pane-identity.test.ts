import { describe, expect, it } from "vitest";
import {
  bindLegacyPaneId,
  capturedClosePaneId,
  CLOSE_PANE_LABEL,
  closeTabLabel,
  EMPTY_PANE_INSTRUCTION,
  EMPTY_PANE_TAB_LABEL,
  factorySurfacePaneIds,
  LAST_VISIBLE_PANE_CLOSE_REASON,
  otherPaneTabsUnchanged,
  paneCloseAffordance,
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

  it("captures the visual active pane for command-palette close", () => {
    expect(capturedClosePaneId("right", "right")).toBe("right");
    expect(capturedClosePaneId("right", "left")).toBe("right");
    expect(capturedClosePaneId("", "left")).toBe("left");
    expect(capturedClosePaneId("right", "left")).not.toBe("left");
  });

  it("keeps empty-pane instruction, placeholder, and close labels distinct", () => {
    expect(EMPTY_PANE_INSTRUCTION).toBe("Open a note from Explorer");
    expect(EMPTY_PANE_TAB_LABEL).toBe("Empty pane");
    expect(CLOSE_PANE_LABEL).toBe("Close this pane");
    expect(closeTabLabel("note.md", "right")).toBe("Close note.md in right");
    expect(CLOSE_PANE_LABEL).not.toBe(closeTabLabel("note.md", "right"));
    expect(EMPTY_PANE_TAB_LABEL).not.toBe(EMPTY_PANE_INSTRUCTION);
    expect(LAST_VISIBLE_PANE_CLOSE_REASON).toBe("Cannot close the last remaining pane");
  });

  it("hides pane close in a popout, disables it for the last main pane, and enables it otherwise", () => {
    expect(paneCloseAffordance({ isPopout: true, visibleMainPaneCount: 3 })).toBe("hidden");
    expect(paneCloseAffordance({ isPopout: false, visibleMainPaneCount: 1 })).toBe("disabled");
    expect(paneCloseAffordance({ isPopout: false, visibleMainPaneCount: 0 })).toBe("disabled");
    expect(paneCloseAffordance({ isPopout: false, visibleMainPaneCount: 2 })).toBe("enabled");
  });
});
