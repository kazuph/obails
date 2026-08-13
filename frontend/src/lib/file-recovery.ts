export type RecentlyDeletedRecord = {
  path: string;
  isDir: boolean;
  deletedAt: string | Date | null;
  deleteMode: string;
};

export type RecoverySnapshotRecord = {
  createdAt: string | Date | null;
  fileCount: number;
};

export function describeRecoveryTimestamp(value: string | Date | null): string {
  if (!value) {
    return "Unknown time";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function describeRecentlyDeletedItem(item: RecentlyDeletedRecord): string {
  const kind = item.isDir ? "Folder" : "File";
  const destination = item.deleteMode === "vault_trash"
    ? "vault Trash"
    : item.deleteMode === "permanent"
      ? "permanent deletion"
      : "system Trash";
  return `${kind} · deleted ${describeRecoveryTimestamp(item.deletedAt)} · ${destination}`;
}

export function describeRecoverySnapshot(snapshot: RecoverySnapshotRecord): string {
  const files = snapshot.fileCount === 1 ? "1 file" : `${snapshot.fileCount} files`;
  return `${describeRecoveryTimestamp(snapshot.createdAt)} · ${files}`;
}

export function describeRecoveryRestoreError(path: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/already exists|file exists|os\\.ErrExist/i.test(message)) {
    return `Cannot restore “${path}” because a file or folder already exists there. Existing vault content was not changed.`;
  }
  return `Could not restore “${path}”: ${message}`;
}
