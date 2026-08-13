import { DocumentHistory } from "./document-history";
import { rewritePathAfterMove } from "./file-tree-ops";
import {
  CapturedSaveScheduler,
  createEditableDocument,
  type EditableDocument,
  type EditableFileKind,
  type FileSnapshot,
  type SaveIntent,
} from "./file-save-state";

export type PrimaryOpenTransition<T> = {
  path: string;
  kind: EditableFileKind;
  generation?: number;
  load: () => Promise<{ snapshot: FileSnapshot; value: T }>;
  /** Synchronous DOM publication while this generation is current. */
  commit: (document: EditableDocument, value: T) => void;
  /** Async follow-up must check isCurrent before every later publication. */
  afterCommit?: (document: EditableDocument, value: T, isCurrent: () => boolean) => Promise<void>;
  fail: (error: unknown) => void;
};

/**
 * The existing rich editor's runtime boundary.
 *
 * It owns the active rich-document identity and transition generation. Existing
 * DOM/viewer behavior remains in injected callbacks so this extraction cannot
 * replace the preview, embeds, or binary viewers with a second editor surface.
 */
export class PrimaryDocumentRuntime {
  readonly history = new DocumentHistory();
  readonly saveScheduler: CapturedSaveScheduler;
  currentFilePath: string | null = null;
  activeEditableDocument: EditableDocument | null = null;
  openGeneration = 0;

  constructor(save: (intent: SaveIntent) => Promise<void>) {
    this.saveScheduler = new CapturedSaveScheduler(save);
  }

  beginOpen(): number {
    this.openGeneration += 1;
    return this.openGeneration;
  }

  isCurrentGeneration(generation: number): boolean {
    return generation === this.openGeneration;
  }

  clearActiveDocument(): void {
    this.currentFilePath = null;
    this.activeEditableDocument = null;
  }

  setNonEditablePath(path: string | null): void {
    this.currentFilePath = path;
    this.activeEditableDocument = null;
  }

  rewritePathIdentity(previousPath: string, nextPath: string, isDir: boolean): void {
    const previousIdentity = this.activeEditableDocument
      ? { path: this.activeEditableDocument.snapshot.path, kind: this.activeEditableDocument.kind }
      : null;
    this.currentFilePath = rewritePathAfterMove(this.currentFilePath, previousPath, nextPath, isDir);
    if (!this.activeEditableDocument) return;
    const rewritten = rewritePathAfterMove(this.activeEditableDocument.snapshot.path, previousPath, nextPath, isDir);
    if (rewritten) this.activeEditableDocument.snapshot.path = rewritten;
    if (previousIdentity) {
      this.history.migrate(previousIdentity, {
        path: this.activeEditableDocument.snapshot.path,
        kind: this.activeEditableDocument.kind,
      });
    }
  }

  async coordinateOpen<T>(transition: PrimaryOpenTransition<T>): Promise<boolean> {
    const generation = transition.generation ?? this.beginOpen();
    try {
      const { snapshot, value } = await transition.load();
      if (!this.isCurrentGeneration(generation)) return false;
      const document = createEditableDocument(transition.kind, snapshot, generation);
      this.currentFilePath = transition.path;
      this.activeEditableDocument = document;
      transition.commit(document, value);
      if (!this.isCurrentGeneration(generation)) return false;
      await transition.afterCommit?.(document, value, () => this.isCurrentGeneration(generation));
      return this.isCurrentGeneration(generation);
    } catch (error) {
      if (!this.isCurrentGeneration(generation)) return false;
      if (this.activeEditableDocument?.generation === generation) this.clearActiveDocument();
      await transition.fail(error);
      return false;
    }
  }
}
