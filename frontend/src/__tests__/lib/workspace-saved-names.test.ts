import { describe, expect, it } from "vitest";
import { savedWorkspaceNames } from "../../lib/workspace-saved-names";

describe("savedWorkspaceNames", () => {
  it("keeps every authoritative saved workspace name available for exact restore", () => {
    expect(savedWorkspaceNames({
      paneTree: { paneId: "pane" },
      activePaneId: "pane",
      paneTabs: [{ paneId: "pane", tabs: [] }],
      savedWorkspaces: [{ name: "A", layout: {} }, { name: "B", layout: {} }],
    })).toEqual(["A", "B"]);
  });
});
