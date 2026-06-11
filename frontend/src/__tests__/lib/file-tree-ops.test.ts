import { describe, expect, it } from "vitest";
import {
  buildChildPath,
  buildRenamePath,
  extractExternalDropPaths,
  fileUriToPath,
  getDisplayName,
  getFileExtension,
  getParentPath,
  hasExternalFileDrop,
  normalizeAndSortFileTree,
  type SortableFileInfo,
  parseFileUriList,
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

  it("parses file uri lists", () => {
    expect(parseFileUriList("file:///Users/test/note.md\n#comment")).toEqual(["/Users/test/note.md"]);
    expect(fileUriToPath("file:///C:/Users/test/note.md")).toBe("C:/Users/test/note.md");
  });

  it("detects external file drops", () => {
    const dataTransfer = {
      getData: () => "file:///tmp/import.md",
      files: [],
    } as DataTransfer;

    expect(hasExternalFileDrop(dataTransfer)).toBe(true);
    expect(extractExternalDropPaths(dataTransfer)).toEqual(["/tmp/import.md"]);
  });

  it("keeps descending file order when audio is not the majority", () => {
    expect(sortNames([
      file("a.md", "markdown"),
      file("c.md", "markdown"),
      file("b.wav", "audio"),
    ])).toEqual(["c.md", "b.wav", "a.md"]);
  });

  it("uses ascending file order when audio files are the majority", () => {
    expect(sortNames([
      file("track-03.wav", "audio"),
      file("track-01.wav", "audio"),
      file("notes.md", "markdown"),
      file("track-02.wav", "audio"),
    ])).toEqual(["notes.md", "track-01.wav", "track-02.wav", "track-03.wav"]);
  });

  it("keeps folders first and sorted ascending even when files are audio-heavy", () => {
    expect(sortNames([
      file("track-02.wav", "audio"),
      folder("z-folder"),
      file("track-01.wav", "audio"),
      folder("a-folder"),
    ])).toEqual(["a-folder", "z-folder", "track-01.wav", "track-02.wav"]);
  });

  it("sorts each folder by its own audio majority", () => {
    const sorted = normalizeAndSortFileTree([
      folder("albums", [
        file("03.wav", "audio", "albums/03.wav"),
        file("01.wav", "audio", "albums/01.wav"),
        file("memo.md", "markdown", "albums/memo.md"),
      ]),
      folder("notes", [
        file("a.wav", "audio", "notes/a.wav"),
        file("c.md", "markdown", "notes/c.md"),
        file("b.md", "markdown", "notes/b.md"),
      ]),
    ]);

    expect(sorted[0].children?.map((child) => child.name)).toEqual(["01.wav", "03.wav", "memo.md"]);
    expect(sorted[1].children?.map((child) => child.name)).toEqual(["c.md", "b.md", "a.wav"]);
  });
});

function sortNames(files: SortableFileInfo[]): string[] {
  return normalizeAndSortFileTree(files).map((file) => file.name);
}

function file(name: string, fileType: string, path = name): SortableFileInfo {
  return {
    name,
    path,
    isDir: false,
    fileType,
    children: null,
  };
}

function folder(name: string, children: SortableFileInfo[] = []): SortableFileInfo {
  return {
    name,
    path: name,
    isDir: true,
    children,
  };
}
