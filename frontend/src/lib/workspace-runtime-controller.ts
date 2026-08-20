import type { AuthoritativeWorkspaceSnapshot } from "./document-runtime-factory";
import { DocumentRuntimeFactory as RuntimeFactory } from "./document-runtime-factory";
import type { PrimaryDocumentRuntime } from "./primary-document-runtime";
import {
  isWorkspaceStateSnapshot,
  leafPaneIds,
  type WorkspacePaneTabsSnapshot,
  type WorkspacePaneTreeSnapshot,
  type WorkspaceStateSnapshot,
  type WorkspaceTabSnapshot,
} from "./workspace-snapshot";

export type {
  WorkspacePaneTabsSnapshot,
  WorkspacePaneTreeSnapshot,
  WorkspaceStateSnapshot,
  WorkspaceTabSnapshot,
} from "./workspace-snapshot";

export type WorkspaceBackend = {
  ensureWorkspace: (paneId: string) => Promise<WorkspaceStateSnapshot>;
  activateWorkspacePane: (paneId: string) => Promise<WorkspaceStateSnapshot>;
  openWorkspaceTab: (paneId: string, tab: WorkspaceTabSnapshot) => Promise<WorkspaceStateSnapshot>;
  openWorkspaceTabInPopout: (paneId: string, popoutId: string, tab: WorkspaceTabSnapshot) => Promise<WorkspaceStateSnapshot>;
  activateWorkspaceTab: (paneId: string, path: string) => Promise<WorkspaceStateSnapshot>;
  activateWorkspaceTabInPopout: (paneId: string, popoutId: string, path: string) => Promise<WorkspaceStateSnapshot>;
  closeWorkspaceTab: (paneId: string, path: string) => Promise<WorkspaceStateSnapshot>;
  closeWorkspaceTabInPopout: (paneId: string, popoutId: string, path: string) => Promise<WorkspaceStateSnapshot>;
  rewriteWorkspaceTabsAfterMove: (previousPath: string, nextPath: string, isDir: boolean) => Promise<WorkspaceStateSnapshot>;
  splitWorkspacePane: (paneId: string, direction: "horizontal" | "vertical", newPaneId: string) => Promise<WorkspaceStateSnapshot>;
  closeWorkspacePane: (paneId: string) => Promise<WorkspaceStateSnapshot>;
  updateWorkspaceSplitWeights: (path: ReadonlyArray<number>, weights: ReadonlyArray<number>) => Promise<WorkspaceStateSnapshot>;
  saveNamedWorkspace: (name: string) => Promise<WorkspaceStateSnapshot>;
  restoreNamedWorkspace: (name: string) => Promise<WorkspaceStateSnapshot>;
  renameNamedWorkspace: (name: string, newName: string) => Promise<WorkspaceStateSnapshot>;
  deleteNamedWorkspace: (name: string) => Promise<WorkspaceStateSnapshot>;
};

export type WorkspaceSnapshotListener = (snapshot: WorkspaceStateSnapshot) => void;

/**
 * Serializes workspace mutations and makes every backend return value the only
 * state snapshot visible to the UI. Runtime teardown is delegated to the
 * factory so save flushes happen before atomic backend calls.
 */
export class WorkspaceRuntimeController {
  private snapshot: WorkspaceStateSnapshot | null = null;
  private activePane = "";
  private transaction: Promise<void> = Promise.resolve();

  constructor(
    private readonly factory: RuntimeFactory,
    private readonly backend: WorkspaceBackend,
    private readonly onSnapshot: WorkspaceSnapshotListener,
  ) {}

  get currentSnapshot(): WorkspaceStateSnapshot | null {
    return this.snapshot;
  }

  get activePaneId(): string {
    return this.activePane;
  }

  async ensureWorkspace(paneId: string): Promise<WorkspaceStateSnapshot> {
    return this.enqueue(async () => {
      const snapshot = await this.backend.ensureWorkspace(paneId);
      this.factory.discardUnopenedPanesExcept(leafPaneIds(snapshot.paneTree));
      return this.commit(snapshot);
    });
  }

  async removeUnavailableTabs(
    snapshot: WorkspaceStateSnapshot,
    pathExists: (path: string) => Promise<boolean>,
  ): Promise<WorkspaceStateSnapshot> {
    return this.enqueue(async () => {
      let current = snapshot;
      let changed = false;
      for (const pane of snapshot.paneTabs ?? []) {
        for (const tab of pane.tabs ?? []) {
          if (await pathExists(tab.path)) continue;
          if (!await this.factory.flushPane(pane.paneId)) return current;
          current = await this.backend.closeWorkspaceTab(pane.paneId, tab.path);
          changed = true;
        }
      }
      return changed ? this.commit(current) : current;
    });
  }

  async openTab(path: string, fileType: string, paneId = this.requireActivePane()): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushPane(paneId)) return null;
      return this.commit(await this.backend.openWorkspaceTab(paneId, { path, fileType }));
    });
  }

  async openTabInRoutedPopout(path: string, fileType: string, paneId: string, popoutId: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushPane(paneId)) return null;
      return this.commit(await this.backend.openWorkspaceTabInPopout(paneId, popoutId, { path, fileType }));
    });
  }

  async activatePane(paneId: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (paneId === this.activePane) return this.snapshot;
      if (this.activePane && !await this.factory.flushPane(this.activePane)) return null;
      return this.commit(await this.backend.activateWorkspacePane(paneId));
    });
  }

  async activateTab(paneId: string, path: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushPane(paneId)) return null;
      return this.commit(await this.backend.activateWorkspaceTab(paneId, path));
    });
  }

  async activateTabInRoutedPopout(paneId: string, popoutId: string, path: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushPane(paneId)) return null;
      return this.commit(await this.backend.activateWorkspaceTabInPopout(paneId, popoutId, path));
    });
  }

  async closeTab(paneId: string, path: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushPane(paneId)) return null;
      return this.commit(await this.backend.closeWorkspaceTab(paneId, path));
    });
  }

  async rewriteTabsAfterMove(previousPath: string, nextPath: string, isDir: boolean): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => this.commit(await this.backend.rewriteWorkspaceTabsAfterMove(previousPath, nextPath, isDir)));
  }

  async closeTabInRoutedPopout(paneId: string, popoutId: string, path: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushPane(paneId)) return null;
      return this.commit(await this.backend.closeWorkspaceTabInPopout(paneId, popoutId, path));
    });
  }

  async closeMissingTab(
    paneId: string,
    path: string,
    runtime: PrimaryDocumentRuntime,
    document: NonNullable<PrimaryDocumentRuntime["activeEditableDocument"]>,
  ): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushMissingDocument(paneId, runtime, document)) return null;
      return this.commit(await this.backend.closeWorkspaceTab(paneId, path));
    });
  }

  async closeMissingTabInRoutedPopout(
    paneId: string,
    popoutId: string,
    path: string,
    runtime: PrimaryDocumentRuntime,
    document: NonNullable<PrimaryDocumentRuntime["activeEditableDocument"]>,
  ): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushMissingDocument(paneId, runtime, document)) return null;
      return this.commit(await this.backend.closeWorkspaceTabInPopout(paneId, popoutId, path));
    });
  }

  async splitPane(paneId: string, direction: "horizontal" | "vertical", newPaneId: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushPane(paneId)) return null;
      return this.commit(await this.backend.splitWorkspacePane(paneId, direction, newPaneId));
    });
  }

  async closePane(paneId?: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      const target = paneId || this.activePane;
      if (!target) return this.snapshot;
      const snapshot = await this.factory.closePane(
        target,
        (id) => this.backend.closeWorkspacePane(id),
      );
      return snapshot ? this.commit(snapshot as WorkspaceStateSnapshot) : null;
    });
  }

  async updateSplitWeights(path: ReadonlyArray<number>, weights: ReadonlyArray<number>): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => this.commit(await this.backend.updateWorkspaceSplitWeights(path, weights)));
  }

  async saveNamedWorkspace(name: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushAll()) return null;
      return this.commit(await this.backend.saveNamedWorkspace(name));
    });
  }

  async restoreNamedWorkspace(name: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      const snapshot = await this.factory.reconcilePanes(() => this.backend.restoreNamedWorkspace(name));
      return snapshot ? this.commit(snapshot as WorkspaceStateSnapshot) : null;
    });
  }

  async renameNamedWorkspace(name: string, newName: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushAll()) return null;
      return this.commit(await this.backend.renameNamedWorkspace(name, newName));
    });
  }

  async deleteNamedWorkspace(name: string): Promise<WorkspaceStateSnapshot | null> {
    return this.enqueue(async () => {
      if (!await this.factory.flushAll()) return null;
      return this.commit(await this.backend.deleteNamedWorkspace(name));
    });
  }

  async adoptBackendSnapshot(snapshot: WorkspaceStateSnapshot): Promise<WorkspaceStateSnapshot> {
    return this.enqueue(async () => this.commit(snapshot));
  }

  private commit(snapshot: WorkspaceStateSnapshot): WorkspaceStateSnapshot {
    if (!isWorkspaceStateSnapshot(snapshot)) {
      throw new Error("Workspace backend returned an invalid snapshot");
    }
    this.snapshot = snapshot;
    this.activePane = snapshot.activePaneId;
    for (const paneId of leafPaneIds(snapshot.paneTree)) this.factory.forPane(paneId);
    this.onSnapshot(snapshot);
    return snapshot;
  }

  private requireActivePane(): string {
    if (!this.activePane) throw new Error("workspace has no active pane");
    return this.activePane;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.transaction.then(operation, operation);
    this.transaction = next.then(() => undefined, () => undefined);
    return next;
  }
}

export { leafPaneIds, visibleLeafPaneIds } from "./workspace-snapshot";

export function paneTabsFor(snapshot: WorkspaceStateSnapshot, paneId: string): WorkspacePaneTabsSnapshot | undefined {
  return snapshot.paneTabs?.find((pane) => pane.paneId === paneId);
}
