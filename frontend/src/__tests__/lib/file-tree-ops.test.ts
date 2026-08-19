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
  isBrowserFileDropWithoutPaths,
  filterMoveDestinationFolders,
  filterTopLevelMoveSources,
  isInvalidMoveDestination,
  matchesVaultRelativePath,
  nextFileTreeSelection,
  nextSearchExpansionState,
  normalizeAndSortFileTree,
  resolveFileTreeSort,
  planMovesToFolder,
  rewritePathAfterMove,
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
    expect(getDisplayName(buildRenamePath("notes/Old Name.md", "New Name", "file"), "file")).toBe("New Name");
  });

  it("rewrites opened paths after a rename or folder move without duplicating title state", () => {
    expect(rewritePathAfterMove("notes/Old Name.md", "notes/Old Name.md", "archive/New Name.md", false))
      .toBe("archive/New Name.md");
    expect(rewritePathAfterMove("notes/Old Name.md/attachment.png", "notes/Old Name.md", "archive/New Name.md", false))
      .toBe("notes/Old Name.md/attachment.png");
    expect(rewritePathAfterMove("notes/Old Name.md/attachment.png", "notes/Old Name.md", "archive/New Name.md", true))
      .toBe("archive/New Name.md/attachment.png");
    expect(rewritePathAfterMove(null, "notes/Old Name.md", "archive/New Name.md", false)).toBeNull();
  });

  it("rejects browser FileLists that do not expose native source paths", () => {
    const withPaths = {
      files: [{ name: "example.png" } as File],
      getData: (type: string) => (type === "text/uri-list" ? "file:///tmp/example.png\n" : ""),
    } as unknown as DataTransfer;
    expect(isBrowserFileDropWithoutPaths(withPaths)).toBe(false);

    const withoutPaths = {
      files: [{ name: "example.png" } as File],
      getData: () => "",
    } as unknown as DataTransfer;
    expect(isBrowserFileDropWithoutPaths(withoutPaths)).toBe(true);
    expect(hasExternalFileDrop(withPaths)).toBe(true);
    expect(hasExternalFileDrop(withoutPaths)).toBe(true);
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
    } as unknown as DataTransfer;

    expect(hasExternalFileDrop(dataTransfer)).toBe(true);
    expect(extractExternalDropPaths(dataTransfer)).toEqual(["/tmp/import.md"]);
  });

  it("hides extensions only for Markdown notes", () => {
    expect(getDisplayName("projects/spec.markdown", "file")).toBe("spec");
    expect(getDisplayName("recordings/meeting.m4a", "file")).toBe("meeting.m4a");
  });

  it("keeps configured descending file order when audio is not the majority", () => {
    expect(sortNames([
      file("a.md", "markdown"),
      file("c.md", "markdown"),
      file("b.wav", "audio"),
    ], { field: "name", direction: "descending" })).toEqual(["c.md", "b.wav", "a.md"]);
  });

  it("sorts name, modified, and created fields in either direction", () => {
    const files = [
      { ...file("z.md", "markdown"), modifiedAt: "2026-01-01", createdAt: "2026-03-01" },
      { ...file("a.md", "markdown"), modifiedAt: "2026-02-01", createdAt: "2026-01-01" },
    ];
    expect(normalizeAndSortFileTree(files, { field: "name", direction: "descending" }).map((item) => item.name)).toEqual(["z.md", "a.md"]);
    expect(normalizeAndSortFileTree(files, { field: "modified", direction: "ascending" }).map((item) => item.name)).toEqual(["z.md", "a.md"]);
    expect(normalizeAndSortFileTree(files, { field: "created", direction: "descending" }).map((item) => item.name)).toEqual(["z.md", "a.md"]);
  });

  it("restores each persisted sort field independently instead of resetting to ascending", () => {
    expect(resolveFileTreeSort("name", "descending")).toEqual({ field: "name", direction: "descending" });
    expect(resolveFileTreeSort(undefined, "descending")).toEqual({ field: "name", direction: "descending" });
    expect(resolveFileTreeSort("created", undefined)).toEqual({ field: "created", direction: "descending" });
    expect(resolveFileTreeSort(undefined, undefined)).toEqual({ field: "name", direction: "descending" });
  });

  it("keeps folders first and sorted ascending even when files are audio-heavy", () => {
    expect(sortNames([
      file("track-02.wav", "audio"),
      folder("z-folder"),
      file("track-01.wav", "audio"),
      folder("a-folder"),
    ], { field: "name", direction: "descending" })).toEqual(["a-folder", "z-folder", "track-01.wav", "track-02.wav"]);
  });

  it("restores the existing per-folder audio-majority ordering rule", () => {
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
    ], { field: "name", direction: "descending" });

    expect(sorted[0].children?.map((child) => child.name)).toEqual(["01.wav", "03.wav", "memo.md"]);
    expect(sorted[1].children?.map((child) => child.name)).toEqual(["c.md", "b.md", "a.wav"]);
  });

  it("matches the vault-relative path rather than only a basename", () => {
    expect(matchesVaultRelativePath("projects/2026/spec.md", "2026/spec")).toBe(true);
    expect(matchesVaultRelativePath("projects/2026/spec.md", "archive")).toBe(false);
  });

  it("captures expansion once and restores it when the Explorer filter clears", () => {
    const expanded = new Set(["projects", "projects/2026"]);
    const firstQuery = nextSearchExpansionState("2026", { snapshot: null }, expanded);
    expect(firstQuery.state.snapshot).toEqual(expanded);
    expect(firstQuery.restoreSnapshot).toBeNull();

    const secondQuery = nextSearchExpansionState("spec", firstQuery.state, expanded);
    expect(secondQuery.state.snapshot).toEqual(expanded);
    expect(secondQuery.restoreSnapshot).toBeNull();

    const cleared = nextSearchExpansionState("", secondQuery.state, expanded);
    expect(cleared.state.snapshot).toBeNull();
    expect(cleared.restoreSnapshot).toEqual(expanded);
  });

  it("uses Cmd/Opt for individual selection and Shift for inclusive ranges", () => {
    const paths = ["a.md", "folder/b.md", "folder/c.md"];
    const individuallySelected = nextFileTreeSelection(new Set(["a.md"]), "a.md", "folder/b.md", paths, true, false);
    expect(individuallySelected.selected).toEqual(new Set(["a.md", "folder/b.md"]));
    const toggledOff = nextFileTreeSelection(individuallySelected.selected, "folder/b.md", "folder/b.md", paths, true, false);
    expect(toggledOff.selected).toEqual(new Set(["a.md"]));
    const rangeSelected = nextFileTreeSelection(individuallySelected.selected, "a.md", "folder/c.md", paths, false, true);
    expect(rangeSelected.selected).toEqual(new Set(paths));
  });

  it("excludes nested selections when a parent folder is already selected", () => {
    expect(filterTopLevelMoveSources(["archive", "archive/old", "other.md"])).toEqual(["archive", "other.md"]);
    expect(planMovesToFolder(["archive", "archive/old"], "imports")).toEqual([
      { sourcePath: "archive", nextPath: "imports/archive" },
    ]);
  });

  it("rejects moving a folder into itself or its descendants", () => {
    expect(isInvalidMoveDestination("archive", "archive")).toBe(true);
    expect(isInvalidMoveDestination("archive/old", "archive")).toBe(true);
    expect(planMovesToFolder(["archive"], "archive/old")).toEqual([]);
    expect(planMovesToFolder(["archive"], "imports")).toEqual([
      { sourcePath: "archive", nextPath: "imports/archive" },
    ]);
  });

  it("filters invalid move destinations from searchable folder candidates", () => {
    const folders = ["", "archive", "archive/old", "imports", "notes"];
    expect(filterMoveDestinationFolders(folders, ["archive"])).toEqual(["", "imports", "notes"]);
    expect(filterMoveDestinationFolders(folders, ["notes/a.md"])).toEqual(folders);
  });

  it("keeps an explicitly selected ascending order when audio is not the majority", () => {
    const files = [
      file("note-c.md", "markdown"),
      file("track-03.wav", "audio"),
      file("note-a.md", "markdown"),
      file("track-01.wav", "audio"),
      file("track-02.wav", "audio"),
      file("note-b.md", "markdown"),
    ];
    expect(sortNames(files, { field: "name", direction: "ascending" })).toEqual([
      "note-a.md",
      "note-b.md",
      "note-c.md",
      "track-01.wav",
      "track-02.wav",
      "track-03.wav",
    ]);
  });
});

function sortNames(files: SortableFileInfo[], sort = { field: "name", direction: "descending" } as const): string[] {
  return normalizeAndSortFileTree(files, sort).map((file) => file.name);
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
