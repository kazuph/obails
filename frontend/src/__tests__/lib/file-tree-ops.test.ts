import { describe, expect, it } from "vitest";
import {
  buildChildPath,
  buildRenamePath,
  getDisplayName,
  getFileExtension,
  getParentPath,
  shouldIgnoreTreeClick,
  validateItemName,
} from "../../lib/file-tree-ops";

describe("file-tree-ops", () => {
  it("validates item names", () => {
    expect(validateItemName("Meeting Notes")).toBe("Meeting Notes");
    expect(() => validateItemName("..")).toThrow("名前を入力してください");
    expect(() => validateItemName("bad/name")).toThrow("/");
  });

  it("builds child paths for files and folders", () => {
    expect(buildChildPath("", "note", "file")).toBe("note.md");
    expect(buildChildPath("projects", "docs", "folder")).toBe("projects/docs");
  });

  it("builds rename targets while preserving file extensions", () => {
    expect(buildRenamePath("projects/spec.md", "final-spec", "file")).toBe("projects/final-spec.md");
    expect(buildRenamePath("projects/archive", "done", "folder")).toBe("projects/done");
  });

  it("extracts path metadata", () => {
    expect(getParentPath("projects/spec.md")).toBe("projects");
    expect(getFileExtension("projects/spec.md")).toBe(".md");
    expect(getDisplayName("projects/spec.md", "file")).toBe("spec");
    expect(getDisplayName("projects/archive", "folder")).toBe("archive");
  });

  it("suppresses clicks immediately after a context menu action", () => {
    expect(shouldIgnoreTreeClick(2, false, false, "docs", "", 0, Date.now())).toBe(true);
    expect(shouldIgnoreTreeClick(0, false, false, "docs", "docs", Date.now() + 100, Date.now())).toBe(true);
    expect(shouldIgnoreTreeClick(0, false, false, "docs", "other", Date.now() + 100, Date.now())).toBe(false);
  });
});
