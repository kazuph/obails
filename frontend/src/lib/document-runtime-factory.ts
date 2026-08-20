import type { SaveIntent } from "./file-save-state";
import { PrimaryDocumentRuntime } from "./primary-document-runtime";
import { isWorkspaceStateSnapshot, type WorkspaceStateSnapshot } from "./workspace-snapshot";

export type RuntimeSave = (
  paneId: string,
  runtime: PrimaryDocumentRuntime,
  intent: SaveIntent,
) => Promise<void>;

export type AuthoritativeWorkspaceSnapshot = WorkspaceStateSnapshot;

export type ClosePane = (
  paneId: string,
  runtime: PrimaryDocumentRuntime,
) => Promise<unknown>;

export type ReconcilePanes = (
  targetPaneIds: ReadonlyArray<string>,
  runtimes: ReadonlyMap<string, PrimaryDocumentRuntime>,
) => Promise<unknown>;

export type ReconcileWorkspace = (
  runtimes: ReadonlyMap<string, PrimaryDocumentRuntime>,
) => Promise<unknown>;

/**
 * Owns the independently mutable document runtime for each workspace pane.
 * The DOM surface is deliberately not copied here: callers attach one rich
 * surface to the runtime returned for its pane.
 */
export class DocumentRuntimeFactory {
  private readonly runtimes = new Map<string, PrimaryDocumentRuntime>();
  private readonly closingPaneIds = new Set<string>();
  private transaction: Promise<void> = Promise.resolve();

  constructor(private readonly save: RuntimeSave) {}

  forPane(paneId: string): PrimaryDocumentRuntime {
    const existing = this.runtimes.get(paneId);
    if (existing) return existing;

    let runtime!: PrimaryDocumentRuntime;
    runtime = new PrimaryDocumentRuntime((intent) => this.save(paneId, runtime, intent));
    this.runtimes.set(paneId, runtime);
    return runtime;
  }

  paneIds(): string[] {
    return [...this.runtimes.keys()];
  }

  discardUnopenedPanesExcept(paneIds: Iterable<string>): void {
    const retained = new Set(paneIds);
    for (const [paneId, runtime] of this.runtimes) {
      if (retained.has(paneId) || runtime.currentFilePath || runtime.activeEditableDocument || this.isPaneClosing(paneId)) continue;
      this.runtimes.delete(paneId);
    }
  }

  canPublishLocal(paneId: string, runtime: PrimaryDocumentRuntime, generation: number): boolean {
    return this.runtimes.get(paneId) === runtime
      && runtime.isCurrentGeneration(generation);
  }

  canPublishShared(paneId: string, runtime: PrimaryDocumentRuntime, generation: number, activePaneId: string): boolean {
    return this.canPublishLocal(paneId, runtime, generation) && activePaneId === paneId;
  }

  isPaneClosing(paneId: string): boolean {
    return this.closingPaneIds.has(paneId);
  }

  scheduleSave(paneId: string, intent: SaveIntent, delay: number): boolean {
    const runtime = this.runtimes.get(paneId);
    if (!runtime || this.isPaneClosing(paneId)) return false;
    runtime.saveScheduler.schedule(intent, delay);
    return true;
  }

  async saveNow(paneId: string, intent: SaveIntent): Promise<boolean> {
    const runtime = this.runtimes.get(paneId);
    if (!runtime || this.isPaneClosing(paneId)) return false;
    await runtime.saveScheduler.saveNow(intent);
    return !runtime.activeEditableDocument?.failure;
  }

  cancelSave(paneId: string, document: PrimaryDocumentRuntime["activeEditableDocument"]): boolean {
    const runtime = this.runtimes.get(paneId);
    if (!runtime || !document || this.isPaneClosing(paneId)) return false;
    runtime.saveScheduler.cancel(document);
    return true;
  }

  async flushPane(paneId: string): Promise<boolean> {
    const runtime = this.runtimes.get(paneId);
    return runtime ? this.prepareForTeardown(runtime) : true;
  }

  async flushMissingDocument(paneId: string, runtime: PrimaryDocumentRuntime, document: NonNullable<PrimaryDocumentRuntime["activeEditableDocument"]>): Promise<boolean> {
    if (this.runtimes.get(paneId) !== runtime
      || runtime.activeEditableDocument !== document
      || document.failure !== "missing"
      || this.isPaneClosing(paneId)) {
      return false;
    }
    try {
      await runtime.saveScheduler.flush();
    } catch {
      return false;
    }
    return this.runtimes.get(paneId) === runtime
      && runtime.activeEditableDocument === document
      && document.failure === "missing";
  }

  async flushAll(): Promise<boolean> {
    for (const runtime of this.runtimes.values()) {
      if (!await this.prepareForTeardown(runtime)) return false;
    }
    return true;
  }

  closePane(paneId: string, close: ClosePane): Promise<AuthoritativeWorkspaceSnapshot | null> {
    return this.enqueue(() => this.closePaneInTransaction(paneId, close));
  }

  retainPanes(paneIds: Iterable<string>, reconcile: ReconcilePanes): Promise<AuthoritativeWorkspaceSnapshot | null> {
    return this.enqueue(async () => {
      const retained = new Set(paneIds);
      const targets = [...this.runtimes.entries()].filter(([id]) => !retained.has(id));
      if (targets.length === 0) return null;

      targets.forEach(([id]) => this.closingPaneIds.add(id));
      try {
        for (const [, runtime] of targets) {
          if (!await this.prepareForTeardown(runtime)) return null;
        }

        const snapshot = await reconcile(targets.map(([id]) => id), new Map(targets));
        if (!this.isAuthoritativeSnapshot(snapshot)) return null;
        const retainedIds = [...this.runtimes.keys()].filter((id) => retained.has(id));
        if (!this.hasExpectedPaneSet(snapshot, targets.map(([id]) => id), retainedIds)) return null;

        for (const [id, runtime] of targets) this.commitTeardown(id, runtime);
        return snapshot;
      } catch {
        return null;
      } finally {
        targets.forEach(([id]) => this.closingPaneIds.delete(id));
      }
    });
  }

  reconcilePanes(reconcile: ReconcileWorkspace): Promise<AuthoritativeWorkspaceSnapshot | null> {
    return this.enqueue(async () => {
      const entries = [...this.runtimes.entries()];
      if (entries.length === 0) return null;

      entries.forEach(([id]) => this.closingPaneIds.add(id));
      try {
        for (const [, runtime] of entries) {
          if (!await this.prepareForTeardown(runtime)) return null;
        }

        const snapshot = await reconcile(new Map(entries));
        if (!this.isAuthoritativeSnapshot(snapshot)) return null;
        const snapshotPaneIds = this.paneTreeIds(snapshot.paneTree);
        if (!snapshotPaneIds) return null;
        for (const [id, runtime] of entries) {
          if (!snapshotPaneIds.has(id)) this.commitTeardown(id, runtime);
        }
        return snapshot;
      } catch {
        return null;
      } finally {
        entries.forEach(([id]) => this.closingPaneIds.delete(id));
      }
    });
  }

  private async closePaneInTransaction(paneId: string, close: ClosePane): Promise<AuthoritativeWorkspaceSnapshot | null> {
    const runtime = this.runtimes.get(paneId);
    if (!runtime) return null;
    this.closingPaneIds.add(paneId);
    try {
      if (!await this.prepareForTeardown(runtime)) return null;
      const snapshot = await close(paneId, runtime);
      if (!this.isAuthoritativeSnapshot(snapshot) || !this.hasExpectedPaneSet(snapshot, [paneId], [...this.runtimes.keys()].filter((id) => id !== paneId))) return null;
      if (runtime.activeEditableDocument?.failure) return null;

      this.commitTeardown(paneId, runtime);
      return snapshot;
    } catch {
      return null;
    } finally {
      this.closingPaneIds.delete(paneId);
    }
  }

  private async prepareForTeardown(runtime: PrimaryDocumentRuntime): Promise<boolean> {
    try {
      await runtime.saveScheduler.flush();
    } catch {
      return false;
    }
    return !runtime.activeEditableDocument?.failure;
  }

  private commitTeardown(paneId: string, runtime: PrimaryDocumentRuntime): void {
    const document = runtime.activeEditableDocument;
    if (document) runtime.history.drop({ path: document.snapshot.path, kind: document.kind });
    this.runtimes.delete(paneId);
  }

  private isAuthoritativeSnapshot(snapshot: unknown): snapshot is AuthoritativeWorkspaceSnapshot {
    return isWorkspaceStateSnapshot(snapshot);
  }

  private paneTreeIds(tree: unknown): Set<string> | null {
    if (!tree || typeof tree !== "object") return null;
    const candidate = tree as WorkspaceStateSnapshot["paneTree"];
    if (candidate.paneId) {
      return typeof candidate.paneId === "string" && !candidate.children ? new Set([candidate.paneId]) : null;
    }
    if (!Array.isArray(candidate.children) || candidate.children.length === 0) return null;
    const ids = new Set<string>();
    for (const child of candidate.children) {
      const childIds = this.paneTreeIds(child);
      if (!childIds) return null;
      for (const paneId of childIds) {
        if (ids.has(paneId)) return null;
        ids.add(paneId);
      }
    }
    return ids;
  }

  private hasExpectedPaneSet(snapshot: AuthoritativeWorkspaceSnapshot, targetIds: ReadonlyArray<string>, retainedIds: ReadonlyArray<string>): boolean {
    const treeIds = this.paneTreeIds(snapshot.paneTree);
    const tabIds = new Set((snapshot.paneTabs ?? []).map((pane) => pane.paneId));
    const expectedIds = new Set(retainedIds);
    if (!treeIds || tabIds.size !== (snapshot.paneTabs ?? []).length || treeIds.size !== tabIds.size || treeIds.size !== expectedIds.size) return false;
    for (const paneId of treeIds) {
      if (!tabIds.has(paneId) || !expectedIds.has(paneId)) return false;
    }
    for (const paneId of targetIds) {
      if (treeIds.has(paneId) || tabIds.has(paneId)) return false;
    }
    return retainedIds.every((paneId) => treeIds.has(paneId) && tabIds.has(paneId));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.transaction.then(operation, operation);
    this.transaction = next.then(() => undefined, () => undefined);
    return next;
  }

}
