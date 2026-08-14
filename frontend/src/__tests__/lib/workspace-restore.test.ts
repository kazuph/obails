import { describe, expect, it } from "vitest";
import { workspaceLeafRestoreTargets, workspacePaneActiveTab } from "../../lib/workspace-restore";
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

  it("keeps the original leaf as a restore target while the new empty pane is active", () => {
    const snapshot: WorkspaceStateSnapshot = {
      paneTree: { splitDirection: "horizontal", children: [{ paneId: "left" }, { paneId: "right" }], weights: [1, 1] },
      activePaneId: "right",
      paneTabs: [
        { paneId: "left", tabs: [{ path: "notes/one.md", fileType: "markdown" }], activeTabPath: "notes/one.md" },
        { paneId: "right", tabs: [] },
      ],
    };
    expect(workspacePaneActiveTab(snapshot, "left")).toEqual({ path: "notes/one.md", fileType: "markdown" });
    expect(workspacePaneActiveTab(snapshot, "right")).toBeUndefined();
    expect(workspaceLeafRestoreTargets(snapshot, "right", new Set(["left", "right"]))).toEqual([
      { paneId: "left", tab: { path: "notes/one.md", fileType: "markdown" } },
    ]);
  });

  it("keeps the cloned active note on the main remainder pane after final popout", () => {
    const snapshot: WorkspaceStateSnapshot = {
      paneTree: { splitDirection: "horizontal", children: [{ paneId: "main" }, { paneId: "remainder" }], weights: [1, 1] },
      activePaneId: "remainder",
      paneTabs: [
        { paneId: "main", tabs: [{ path: "notes/one.md", fileType: "markdown" }], activeTabPath: "notes/one.md" },
        { paneId: "remainder", tabs: [{ path: "notes/one.md", fileType: "markdown" }], activeTabPath: "notes/one.md" },
      ],
      popoutWindows: [{ id: "only", paneId: "main", x: 0, y: 0, width: 640, height: 480 }],
    };
    expect(workspacePaneActiveTab(snapshot, "remainder")).toEqual({ path: "notes/one.md", fileType: "markdown" });
    expect(workspacePaneActiveTab(snapshot, "main")).toEqual({ path: "notes/one.md", fileType: "markdown" });
    expect(workspaceLeafRestoreTargets(snapshot, "remainder", new Set(["remainder"]))).toEqual([]);
  });
});
