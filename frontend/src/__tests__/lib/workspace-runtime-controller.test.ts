import { describe, expect, it } from "vitest";
import { DocumentRuntimeFactory } from "../../lib/document-runtime-factory";
import { createEditableDocument } from "../../lib/file-save-state";
import {
  WorkspaceRuntimeController,
  paneTabsFor,
  type WorkspaceBackend,
  type WorkspaceStateSnapshot,
} from "../../lib/workspace-runtime-controller";
import { isWorkspaceStateSnapshot } from "../../lib/workspace-snapshot";

function snapshot(paneIds: string[], activePaneId = paneIds[0]): WorkspaceStateSnapshot {
  return {
    paneTree: paneIds.length === 1
      ? { paneId: paneIds[0] }
      : { splitDirection: "horizontal", children: paneIds.map((paneId) => ({ paneId })), weights: paneIds.map(() => 1) },
    activePaneId,
    paneTabs: paneIds.map((paneId) => ({ paneId, tabs: [] })),
  };
}

function backendFor(initial: WorkspaceStateSnapshot) {
  let current = initial;
  let restoreCalls = 0;
  const backend: WorkspaceBackend = {
    ensureWorkspace: async () => current,
    activateWorkspacePane: async (paneId) => (current = { ...current, activePaneId: paneId }),
    openWorkspaceTab: async (paneId, tab) => (current = {
      ...current,
      activePaneId: paneId,
      paneTabs: (current.paneTabs ?? []).map((pane) => pane.paneId === paneId
        ? { ...pane, tabs: [...(pane.tabs ?? []).filter((entry) => entry.path !== tab.path), tab], activeTabPath: tab.path }
        : pane),
    }),
    openWorkspaceTabInPopout: async (paneId, _popoutId, tab) => (current = {
      ...current,
      paneTabs: (current.paneTabs ?? []).map((pane) => pane.paneId === paneId
        ? { ...pane, tabs: [...(pane.tabs ?? []).filter((entry) => entry.path !== tab.path), tab], activeTabPath: tab.path }
        : pane),
    }),
    activateWorkspaceTab: async (paneId, path) => (current = {
      ...current,
      activePaneId: paneId,
      paneTabs: (current.paneTabs ?? []).map((pane) => pane.paneId === paneId ? { ...pane, activeTabPath: path } : pane),
    }),
    closeWorkspaceTab: async (paneId, path) => (current = {
      ...current,
      paneTabs: (current.paneTabs ?? []).map((pane) => pane.paneId === paneId
        ? { ...pane, tabs: (pane.tabs ?? []).filter((entry) => entry.path !== path), activeTabPath: "" }
        : pane),
    }),
    activateWorkspaceTabInPopout: async (paneId, _popoutId, path) => (current = {
      ...current,
      paneTabs: (current.paneTabs ?? []).map((pane) => pane.paneId === paneId ? { ...pane, activeTabPath: path } : pane),
    }),
    closeWorkspaceTabInPopout: async (paneId, _popoutId, path) => (current = {
      ...current,
      paneTabs: (current.paneTabs ?? []).map((pane) => pane.paneId === paneId
        ? { ...pane, tabs: (pane.tabs ?? []).filter((entry) => entry.path !== path), activeTabPath: "" }
        : pane),
    }),
    rewriteWorkspaceTabsAfterMove: async (previousPath, nextPath) => (current = {
      ...current,
      paneTabs: (current.paneTabs ?? []).map((pane) => {
        const tabs = (pane.tabs ?? []).map((tab) => tab.path === previousPath ? { ...tab, path: nextPath } : tab);
        return {
          ...pane,
          tabs,
          activeTabPath: pane.activeTabPath === previousPath ? nextPath : pane.activeTabPath,
        };
      }),
    }),
    splitWorkspacePane: async (paneId, _direction, newPaneId) => {
      current = snapshot([paneId, newPaneId], newPaneId);
      return current;
    },
    closeWorkspacePane: async (paneId) => {
      current = snapshot((current.paneTabs ?? []).map((pane) => pane.paneId).filter((id) => id !== paneId), "left");
      return current;
    },
    updateWorkspaceSplitWeights: async () => current,
    saveNamedWorkspace: async () => current,
    restoreNamedWorkspace: async () => {
      restoreCalls += 1;
      current = snapshot(["restored"] , "restored");
      return current;
    },
    renameNamedWorkspace: async () => current,
    deleteNamedWorkspace: async () => current,
  };
  return { backend, get restoreCalls() { return restoreCalls; } };
}

describe("WorkspaceRuntimeController", () => {
  it("uses returned snapshots for ensure, open, split, activate, and close routing", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const backendState = backendFor(snapshot(["left"]));
    const snapshots: WorkspaceStateSnapshot[] = [];
    const controller = new WorkspaceRuntimeController(factory, backendState.backend, (next) => snapshots.push(next));

    await controller.ensureWorkspace("left");
    await controller.openTab("left.md", "markdown");
    const split = await controller.splitPane("left", "horizontal", "right");
    expect(split?.activePaneId).toBe("right");
    expect(factory.paneIds()).toEqual(["left", "right"]);
    await controller.activatePane("left");
    expect(controller.activePaneId).toBe("left");
    await controller.closePane("right");
    expect(factory.paneIds()).toEqual(["left"]);
    expect(snapshots.at(-1)?.paneTree?.paneId).toBe("left");
  });

  it("forwards both split directions to the atomic backend mutation", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const backendState = backendFor(snapshot(["left"]));
    let direction: "horizontal" | "vertical" | null = null;
    const controller = new WorkspaceRuntimeController(factory, {
      ...backendState.backend,
      splitWorkspacePane: async (paneId, requestedDirection, newPaneId) => {
        direction = requestedDirection;
        return {
          paneTree: { splitDirection: requestedDirection, children: [{ paneId }, { paneId: newPaneId }], weights: [1, 1] },
          activePaneId: newPaneId,
          paneTabs: [{ paneId, tabs: [] }, { paneId: newPaneId, tabs: [] }],
        };
      },
    }, () => {});

    await controller.ensureWorkspace("left");
    await controller.splitPane("left", "vertical", "below");
    expect(direction).toBe("vertical");
  });

  it("keeps the current snapshot when split-weight persistence fails", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const initial = snapshot(["left", "right"]);
    const snapshots: WorkspaceStateSnapshot[] = [];
    const backendState = backendFor(initial);
    const controller = new WorkspaceRuntimeController(factory, {
      ...backendState.backend,
      updateWorkspaceSplitWeights: async () => { throw new Error("state write failed"); },
    }, (next) => snapshots.push(next));

    await controller.ensureWorkspace("left");
    await expect(controller.updateSplitWeights([], [2, 1])).rejects.toThrow("state write failed");
    expect(controller.currentSnapshot).toEqual(initial);
    expect(snapshots).toEqual([initial]);
  });

  it("restores a named workspace with one atomic callback and removes absent runtimes together", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    factory.forPane("left");
    factory.forPane("right");
    const backendState = backendFor(snapshot(["left", "right"], "left"));
    const controller = new WorkspaceRuntimeController(factory, backendState.backend, () => {});

    const restored = await controller.restoreNamedWorkspace("Writing");
    expect(restored?.paneTree?.paneId).toBe("restored");
    expect(backendState.restoreCalls).toBe(1);
    expect(factory.paneIds()).toEqual(["restored"]);
  });

  it("accepts backend snapshots with omitted split weights and rejects malformed saved layouts", () => {
    expect(isWorkspaceStateSnapshot({
      paneTree: { splitDirection: "horizontal", children: [{ paneId: "left" }, { paneId: "right" }] },
      activePaneId: "left",
      paneTabs: [{ paneId: "left", tabs: [] }, { paneId: "right", tabs: [] }],
    })).toBe(true);
    expect(isWorkspaceStateSnapshot({
      ...snapshot(["left"]),
      savedWorkspaces: [{ name: "Writing", layout: { paneTree: { paneId: "missing-tabs" }, activePaneId: "missing-tabs", paneTabs: [{ paneId: "wrong", tabs: [] }] } }],
    })).toBe(false);
  });

  it("keeps the rendered snapshot and runtimes when restore returns an invalid saved layout", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const initial = snapshot(["left", "right"], "left");
    const backendState = backendFor(initial);
    const snapshots: WorkspaceStateSnapshot[] = [];
    const controller = new WorkspaceRuntimeController(factory, {
      ...backendState.backend,
      restoreNamedWorkspace: async () => ({
        ...initial,
        savedWorkspaces: [{ name: "invalid", layout: { paneTree: { paneId: "orphan" }, activePaneId: "orphan", paneTabs: [{ paneId: "different", tabs: [] }] } }],
      }),
    }, (next) => snapshots.push(next));

    await controller.ensureWorkspace("left");
    const before = controller.currentSnapshot;
    const beforePaneIds = factory.paneIds();
    expect(await controller.restoreNamedWorkspace("invalid")).toBeNull();
    expect(controller.currentSnapshot).toBe(before);
    expect(factory.paneIds()).toEqual(beforePaneIds);
    expect(snapshots).toEqual([before]);
  });

  it("restores a complete layout with omitted split weights", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    factory.forPane("left");
    const backendState = backendFor(snapshot(["left"]));
    const controller = new WorkspaceRuntimeController(factory, {
      ...backendState.backend,
      restoreNamedWorkspace: async () => ({
        paneTree: { splitDirection: "vertical", children: [{ paneId: "left" }, { paneId: "right" }] },
        activePaneId: "right",
        paneTabs: [{ paneId: "left", tabs: [] }, { paneId: "right", tabs: [] }],
      }),
    }, () => {});

    const restored = await controller.restoreNamedWorkspace("unweighted");
    expect(restored?.paneTree.weights).toBeUndefined();
    expect(controller.activePaneId).toBe("right");
    expect(factory.paneIds()).toEqual(["left", "right"]);
  });

  it("keeps the shared active pane while a routed popout opens and activates tabs in its exact pane", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const initial = {
      paneTree: { splitDirection: "horizontal" as const, children: [{ paneId: "main" }, { paneId: "popout" }] },
      activePaneId: "main",
      paneTabs: [
        { paneId: "main", tabs: [{ path: "notes/main.md", fileType: "markdown" }], activeTabPath: "notes/main.md" },
        { paneId: "popout", tabs: [{ path: "notes/first.md", fileType: "markdown" }], activeTabPath: "notes/first.md" },
      ],
    };
    const backendState = backendFor(initial);
    const snapshots: WorkspaceStateSnapshot[] = [];
    const controller = new WorkspaceRuntimeController(factory, backendState.backend, (next) => snapshots.push(next));

    await controller.ensureWorkspace("main");
    await controller.openTabInRoutedPopout("notes/second.md", "markdown", "popout", "child");
    expect(controller.activePaneId).toBe("main");
    expect(snapshots.at(-1)?.activePaneId).toBe("main");
    expect(paneTabsFor(snapshots.at(-1)!, "popout")?.activeTabPath).toBe("notes/second.md");

    await controller.activateTabInRoutedPopout("popout", "child", "notes/first.md");
    expect(controller.activePaneId).toBe("main");
    expect(paneTabsFor(snapshots.at(-1)!, "popout")?.activeTabPath).toBe("notes/first.md");
  });

  it("closes a flushed missing document only through the returned tab snapshot", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const runtime = factory.forPane("left");
    const document = createEditableDocument("markdown", { path: "missing.md", content: "draft", revision: "r1" }, runtime.beginOpen());
    document.failure = "missing";
    runtime.activeEditableDocument = document;
    runtime.currentFilePath = document.snapshot.path;
    const initial = {
      paneTree: { paneId: "left" },
      activePaneId: "left",
      paneTabs: [{ paneId: "left", tabs: [{ path: "missing.md", fileType: "markdown" }], activeTabPath: "missing.md" }],
    } satisfies WorkspaceStateSnapshot;
    const backendState = backendFor(initial);
    const controller = new WorkspaceRuntimeController(factory, backendState.backend, () => {});

    await controller.ensureWorkspace("left");
    const closed = await controller.closeMissingTab("left", "missing.md", runtime, document);
    expect(paneTabsFor(closed!, "left")?.tabs).toEqual([]);
    expect(runtime.activeEditableDocument).toBe(document);
    expect(document.failure).toBe("missing");
  });

  it("keeps a missing document runtime and history intact when the authoritative tab close fails", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const runtime = factory.forPane("left");
    const document = createEditableDocument("markdown", { path: "missing.md", content: "draft", revision: "r1" }, runtime.beginOpen());
    document.failure = "missing";
    runtime.activeEditableDocument = document;
    runtime.currentFilePath = document.snapshot.path;
    runtime.history.rebase({ path: document.snapshot.path, kind: document.kind }, { content: "draft", selectionStart: 0, selectionEnd: 0, scrollTop: 0 });
    const initial = {
      paneTree: { paneId: "left" },
      activePaneId: "left",
      paneTabs: [{ paneId: "left", tabs: [{ path: "missing.md", fileType: "markdown" }], activeTabPath: "missing.md" }],
    } satisfies WorkspaceStateSnapshot;
    const backendState = backendFor(initial);
    const controller = new WorkspaceRuntimeController(factory, {
      ...backendState.backend,
      closeWorkspaceTab: async () => { throw new Error("disk write failed"); },
    }, () => {});

    await controller.ensureWorkspace("left");
    await expect(controller.closeMissingTab("left", "missing.md", runtime, document)).rejects.toThrow("disk write failed");
    expect(controller.currentSnapshot).toEqual(initial);
    expect(runtime.activeEditableDocument).toBe(document);
    expect(document.failure).toBe("missing");
    expect(runtime.history.current({ path: document.snapshot.path, kind: document.kind })?.content).toBe("draft");
  });

  it("renames and deletes named workspaces through one atomic backend call without restoring panes", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const initial = {
      ...snapshot(["left"]),
      savedWorkspaces: [{ name: "Writing", layout: { paneTree: { paneId: "left" }, activePaneId: "left" } }],
      activeNamedWorkspace: "Writing",
    };
    let renamed = 0;
    let deleted = 0;
    const backendState = backendFor(initial);
    const controller = new WorkspaceRuntimeController(factory, {
      ...backendState.backend,
      renameNamedWorkspace: async (_name, newName) => {
        renamed += 1;
        return {
          ...initial,
          savedWorkspaces: [{ name: newName, layout: { paneTree: { paneId: "left" }, activePaneId: "left" } }],
          activeNamedWorkspace: newName,
        };
      },
      deleteNamedWorkspace: async () => {
        deleted += 1;
        return { ...snapshot(["left"]), savedWorkspaces: [], activeNamedWorkspace: "" };
      },
    }, () => {});

    await controller.ensureWorkspace("left");
    const afterRename = await controller.renameNamedWorkspace("Writing", "Drafts");
    expect(renamed).toBe(1);
    expect(afterRename?.activeNamedWorkspace).toBe("Drafts");
    expect(afterRename?.savedWorkspaces?.map((workspace) => workspace.name)).toEqual(["Drafts"]);
    expect(factory.paneIds()).toEqual(["left"]);

    const afterDelete = await controller.deleteNamedWorkspace("Drafts");
    expect(deleted).toBe(1);
    expect(afterDelete?.activeNamedWorkspace ?? "").toBe("");
    expect(afterDelete?.savedWorkspaces ?? []).toEqual([]);
    expect(factory.paneIds()).toEqual(["left"]);
  });

  it("replaces the same tab record after a rename without adding a new tab or changing the active pane", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const initial = {
      paneTree: { paneId: "left" },
      activePaneId: "left",
      paneTabs: [{
        paneId: "left",
        tabs: [
          { path: "notes/Old Name.md", fileType: "markdown" },
          { path: "notes/Keep.md", fileType: "markdown" },
        ],
        activeTabPath: "notes/Old Name.md",
      }],
    } satisfies WorkspaceStateSnapshot;
    const backendState = backendFor(initial);
    const snapshots: WorkspaceStateSnapshot[] = [];
    const controller = new WorkspaceRuntimeController(factory, backendState.backend, (next) => snapshots.push(next));

    await controller.ensureWorkspace("left");
    const rewritten = await controller.rewriteTabsAfterMove("notes/Old Name.md", "notes/New Name.md", false);
    expect(controller.activePaneId).toBe("left");
    expect(paneTabsFor(rewritten!, "left")?.tabs).toEqual([
      { path: "notes/New Name.md", fileType: "markdown" },
      { path: "notes/Keep.md", fileType: "markdown" },
    ]);
    expect(paneTabsFor(rewritten!, "left")?.activeTabPath).toBe("notes/New Name.md");
    expect(paneTabsFor(rewritten!, "left")?.tabs).toHaveLength(2);
    expect(snapshots.at(-1)).toBe(rewritten);
  });
});
