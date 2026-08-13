import { describe, expect, it } from "vitest";
import { workspaceLeafRestoreTargets } from "../../lib/workspace-restore";
import type { WorkspaceStateSnapshot } from "../../lib/workspace-snapshot";

describe("workspaceLeafRestoreTargets", () => {
  it("restores every inactive leaf, including the initial legacy pane after a later active-pane change", () => {
    const snapshot: WorkspaceStateSnapshot = {
      paneTree: {
        splitDirection: "horizontal",
        children: [{ paneId: "legacy" }, { paneId: "active" }, { paneId: "third" }],
        weights: [3, 1, 1],
      },
      activePaneId: "active",
      paneTabs: [
        { paneId: "legacy", tabs: [{ path: "legacy.md", fileType: "markdown" }], activeTabPath: "legacy.md" },
        { paneId: "active", tabs: [{ path: "active.md", fileType: "markdown" }], activeTabPath: "active.md" },
        { paneId: "third", tabs: [{ path: "third.md", fileType: "markdown" }], activeTabPath: "third.md" },
      ],
    };

    expect(workspaceLeafRestoreTargets(snapshot, "active")).toEqual([
      { paneId: "legacy", tab: { path: "legacy.md", fileType: "markdown" } },
      { paneId: "third", tab: { path: "third.md", fileType: "markdown" } },
    ]);
  });

  it("never restores a detached pane into the main renderer", () => {
    const snapshot: WorkspaceStateSnapshot = {
      paneTree: { splitDirection: "horizontal", children: [{ paneId: "main" }, { paneId: "detached" }] },
      activePaneId: "main",
      paneTabs: [
        { paneId: "main", tabs: [], activeTabPath: "" },
        { paneId: "detached", tabs: [{ path: "detached.md", fileType: "markdown" }], activeTabPath: "detached.md" },
      ],
    };

    expect(workspaceLeafRestoreTargets(snapshot, "main", new Set(["main"]))).toEqual([]);
  });
});
