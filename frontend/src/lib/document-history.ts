import type { EditableFileKind } from "./file-save-state";

export type DocumentKind = EditableFileKind;

export type DocumentIdentity = {
  path: string;
  kind: DocumentKind;
};

export type DocumentSnapshot = {
  content: string;
  selectionStart: number;
  selectionEnd: number;
  scrollTop: number;
};

export type DocumentViewState = Omit<DocumentSnapshot, "content">;

type Timeline = {
  snapshots: DocumentSnapshot[];
  index: number;
};

/** Keeps uncapped, session-local editor history without DOM event dependencies. */
export class DocumentHistory {
  private readonly timelines = new Map<string, Timeline>();

  recordEdit(identity: DocumentIdentity, snapshot: DocumentSnapshot): void {
    const key = identityKey(identity);
    const timeline = this.timelines.get(key);

    if (!timeline) {
      this.timelines.set(key, { snapshots: [copySnapshot(snapshot)], index: 0 });
      return;
    }

    if (sameSnapshot(timeline.snapshots[timeline.index], snapshot)) {
      return;
    }

    timeline.snapshots.splice(timeline.index + 1);
    timeline.snapshots.push(copySnapshot(snapshot));
    timeline.index += 1;
  }

  undo(identity: DocumentIdentity): DocumentSnapshot | null {
    const timeline = this.timelines.get(identityKey(identity));
    if (!timeline || timeline.index === 0) {
      return null;
    }

    timeline.index -= 1;
    return copySnapshot(timeline.snapshots[timeline.index]);
  }

  redo(identity: DocumentIdentity): DocumentSnapshot | null {
    const timeline = this.timelines.get(identityKey(identity));
    if (!timeline || timeline.index === timeline.snapshots.length - 1) {
      return null;
    }

    timeline.index += 1;
    return copySnapshot(timeline.snapshots[timeline.index]);
  }

  current(identity: DocumentIdentity): DocumentSnapshot | null {
    const timeline = this.timelines.get(identityKey(identity));
    return timeline ? copySnapshot(timeline.snapshots[timeline.index]) : null;
  }

  updateCurrentView(identity: DocumentIdentity, view: DocumentViewState): void {
    const timeline = this.timelines.get(identityKey(identity));
    if (!timeline) {
      return;
    }
    const current = timeline.snapshots[timeline.index];
    timeline.snapshots[timeline.index] = copySnapshot({ ...current, ...view });
  }

  reset(identity: DocumentIdentity, snapshot: DocumentSnapshot): void {
    this.timelines.set(identityKey(identity), {
      snapshots: [copySnapshot(snapshot)],
      index: 0,
    });
  }

  rebase(identity: DocumentIdentity, snapshot: DocumentSnapshot): void {
    this.reset(identity, snapshot);
  }

  migrate(from: DocumentIdentity, to: DocumentIdentity): void {
    const fromKey = identityKey(from);
    const toKey = identityKey(to);
    if (fromKey === toKey) {
      return;
    }

    const timeline = this.timelines.get(fromKey);
    if (!timeline) {
      return;
    }

    this.timelines.set(toKey, timeline);
    this.timelines.delete(fromKey);
  }

  drop(identity: DocumentIdentity): void {
    this.timelines.delete(identityKey(identity));
  }
}

function identityKey(identity: DocumentIdentity): string {
  return JSON.stringify([identity.path, identity.kind]);
}

function copySnapshot(snapshot: DocumentSnapshot): DocumentSnapshot {
  return {
    content: snapshot.content,
    selectionStart: snapshot.selectionStart,
    selectionEnd: snapshot.selectionEnd,
    scrollTop: snapshot.scrollTop,
  };
}

function sameSnapshot(left: DocumentSnapshot, right: DocumentSnapshot): boolean {
  return left.content === right.content
    && left.selectionStart === right.selectionStart
    && left.selectionEnd === right.selectionEnd
    && left.scrollTop === right.scrollTop;
}
