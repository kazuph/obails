import { describe, expect, it } from "vitest";
import {
  describeRecentlyDeletedItem,
  describeRecoveryRestoreError,
  describeRecoverySnapshot,
} from "../../lib/file-recovery";

describe("P-072/P-073 recovery presentation", () => {
  it("labels deleted files with the recovery destination", () => {
    expect(describeRecentlyDeletedItem({
      path: "notes/plan.md",
      isDir: false,
      deletedAt: "2026-08-10T00:00:00Z",
      deleteMode: "system_trash",
    })).toContain("system Trash");
  });

  it("labels snapshots with their complete file count", () => {
    expect(describeRecoverySnapshot({
      createdAt: "2026-08-10T00:00:00Z",
      fileCount: 1,
    })).toContain("1 file");
  });

  it("makes restore collisions explicit and promises no overwrite", () => {
    expect(describeRecoveryRestoreError("notes/plan.md", new Error("file already exists")))
      .toBe("Cannot restore “notes/plan.md” because a file or folder already exists there. Existing vault content was not changed.");
  });
});
