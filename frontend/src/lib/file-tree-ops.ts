export type ItemKind = "file" | "folder";

const INVALID_NAME_CHARS = /[<>:"/\\|?*]/;
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "ogg", "flac", "aac", "opus"]);
export type SortableFileInfo = {
  name: string;
  path: string;
  isDir: boolean;
  fileType?: string;
  modifiedAt?: string | Date;
  createdAt?: string | Date;
  children?: SortableFileInfo[] | null;
};

export type FileTreeSortField = "name" | "modified" | "created";
export type FileTreeSortDirection = "ascending" | "descending";
export type FileTreeSort = { field: FileTreeSortField; direction: FileTreeSortDirection };

export const DEFAULT_FILE_TREE_SORT: FileTreeSort = { field: "name", direction: "descending" };

export function resolveFileTreeSort(field: unknown, direction: unknown): FileTreeSort {
  return {
    field: field === "name" || field === "modified" || field === "created"
      ? field
      : DEFAULT_FILE_TREE_SORT.field,
    direction: direction === "ascending" || direction === "descending"
      ? direction
      : DEFAULT_FILE_TREE_SORT.direction,
  };
}

export function validateItemName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new Error("名前を入力してください");
  }
  if (INVALID_NAME_CHARS.test(trimmed)) {
    throw new Error('ファイル名に < > : " / \\ | ? * は使えません');
  }
  if (trimmed.endsWith(".")) {
    throw new Error("名前を . で終えることはできません");
  }
  return trimmed;
}

export function getParentPath(path: string): string {
  const lastSlashIndex = path.lastIndexOf("/");
  return lastSlashIndex === -1 ? "" : path.slice(0, lastSlashIndex);
}

export function getDisplayName(path: string, kind: ItemKind): string {
  const basename = path.split("/").pop() || path;
  if (kind === "folder") {
    return basename;
  }
  return basename.replace(/\.(?:md|markdown)$/i, "");
}

export function getFileExtension(path: string): string {
  const basename = path.split("/").pop() || path;
  const dotIndex = basename.lastIndexOf(".");
  return dotIndex <= 0 ? "" : basename.slice(dotIndex);
}

export function buildChildPath(parentPath: string, name: string, kind: ItemKind): string {
  const validated = validateItemName(name);
  const withExtension = kind === "file" && !validated.endsWith(".md") ? `${validated}.md` : validated;
  return parentPath ? `${parentPath}/${withExtension}` : withExtension;
}

export function buildRenamePath(currentPath: string, nextName: string, kind: ItemKind): string {
  const validated = validateItemName(nextName);
  const parentPath = getParentPath(currentPath);
  if (kind === "folder") {
    return parentPath ? `${parentPath}/${validated}` : validated;
  }
  const ext = getFileExtension(currentPath);
  const nextFilename = ext ? `${validated}${ext}` : validated;
  return parentPath ? `${parentPath}/${nextFilename}` : nextFilename;
}

export function rewritePathAfterMove(
  path: string | null,
  previousPath: string,
  nextPath: string,
  isDir: boolean,
): string | null {
  if (!path) {
    return path;
  }
  if (path === previousPath) {
    return nextPath;
  }
  if (isDir && path.startsWith(`${previousPath}/`)) {
    return `${nextPath}${path.slice(previousPath.length)}`;
  }
  return path;
}

export function isBrowserFileDropWithoutPaths(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer?.files.length) && extractExternalDropPaths(dataTransfer).length === 0;
}

export function shouldIgnoreTreeClick(
  button: number,
  ctrlKey: boolean,
  metaKey: boolean,
  path: string,
  suppressedPath: string,
  suppressUntil: number,
  now: number
): boolean {
  if (button !== 0 || ctrlKey || metaKey) {
    return true;
  }
  return path === suppressedPath && now < suppressUntil;
}

export function parseFileUriList(uriList: string): string[] {
  return uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .map((line) => fileUriToPath(line))
    .filter((path): path is string => Boolean(path));
}

export function fileUriToPath(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "file:") {
      return null;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return pathname || null;
  } catch {
    return null;
  }
}

export function extractExternalDropPaths(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer) {
    return [];
  }

  const paths = new Set<string>();

  for (const uri of parseFileUriList(dataTransfer.getData("text/uri-list"))) {
    paths.add(uri);
  }

  for (const file of Array.from(dataTransfer.files)) {
    const filePath = (file as File & { path?: string }).path;
    if (filePath) {
      paths.add(filePath);
    }
  }

  return Array.from(paths);
}

export function hasExternalFileDrop(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }
  if (extractExternalDropPaths(dataTransfer).length > 0) {
    return true;
  }
  return dataTransfer.files.length > 0;
}

export function compareFileInfoForSort(
  a: SortableFileInfo,
  b: SortableFileInfo,
  sort: FileTreeSort = DEFAULT_FILE_TREE_SORT,
  filesAscending = false,
): number {
  if (a.isDir !== b.isDir) {
    return a.isDir ? -1 : 1;
  }
  if (a.isDir) {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  }
  const compare = sort.field === "name"
    ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    : compareDates(
      sort.field === "modified" ? a.modifiedAt : a.createdAt,
      sort.field === "modified" ? b.modifiedAt : b.createdAt,
    );
  const result = compare || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  return filesAscending || sort.direction === "ascending" ? result : -result;
}

export function normalizeAndSortFileTree<T extends SortableFileInfo>(files: T[], sort: FileTreeSort = DEFAULT_FILE_TREE_SORT): T[] {
  const filesAscending = sort.field === "name" && hasAudioMajority(files);

  return files
    .map((file) => ({
      ...file,
      children: file.children?.length ? normalizeAndSortFileTree(file.children, sort) : [],
    }) as T)
    .sort((a, b) => compareFileInfoForSort(a, b, sort, filesAscending));
}

export function hasAudioMajority(files: SortableFileInfo[]): boolean {
  let audioCount = 0;
  let otherFileCount = 0;

  for (const file of files) {
    if (file.isDir) continue;
    if (isAudioFile(file)) {
      audioCount += 1;
    } else {
      otherFileCount += 1;
    }
  }

  return audioCount > otherFileCount;
}

function isAudioFile(file: SortableFileInfo): boolean {
  if ((file.fileType || "").toLowerCase() === "audio") return true;
  const extension = file.path.split(".").pop()?.toLowerCase() || "";
  return AUDIO_EXTENSIONS.has(extension);
}

function compareDates(a: string | Date | undefined, b: string | Date | undefined): number {
  return (a ? new Date(a).getTime() : 0) - (b ? new Date(b).getTime() : 0);
}

export function matchesVaultRelativePath(path: string, query: string): boolean {
  return path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export interface SearchExpansionState {
  snapshot: Set<string> | null;
}

export function nextSearchExpansionState(
  query: string,
  state: SearchExpansionState,
  expandedPaths: Set<string>,
): { state: SearchExpansionState; restoreSnapshot: Set<string> | null } {
  if (!query.trim()) {
    return {
      state: { snapshot: null },
      restoreSnapshot: state.snapshot,
    };
  }
  if (state.snapshot === null) {
    return {
      state: { snapshot: new Set(expandedPaths) },
      restoreSnapshot: null,
    };
  }
  return { state, restoreSnapshot: null };
}

export function isPathUnderAncestor(path: string, ancestorPath: string): boolean {
  if (!ancestorPath) {
    return false;
  }
  return path === ancestorPath || path.startsWith(`${ancestorPath}/`);
}

export function filterTopLevelMoveSources(sourcePaths: string[]): string[] {
  return sourcePaths.filter((sourcePath) =>
    !sourcePaths.some((other) => other !== sourcePath && isPathUnderAncestor(sourcePath, other)),
  );
}

export function isInvalidMoveDestination(targetFolder: string, sourcePath: string): boolean {
  if (!sourcePath) {
    return false;
  }
  if (targetFolder === sourcePath) {
    return true;
  }
  return isPathUnderAncestor(targetFolder, sourcePath);
}

export function planMovesToFolder(
  sourcePaths: string[],
  targetFolder: string,
): Array<{ sourcePath: string; nextPath: string }> {
  return filterTopLevelMoveSources(sourcePaths)
    .map((sourcePath) => ({
      sourcePath,
      nextPath: targetFolder
        ? `${targetFolder}/${sourcePath.split("/").pop()!}`
        : sourcePath.split("/").pop()!,
    }))
    .filter(({ sourcePath, nextPath }) => sourcePath !== nextPath && !isInvalidMoveDestination(targetFolder, sourcePath));
}

export function filterMoveDestinationFolders(folderPaths: string[], sourcePaths: string[]): string[] {
  return folderPaths.filter((folderPath) =>
    !sourcePaths.some((sourcePath) => isInvalidMoveDestination(folderPath, sourcePath)),
  );
}

export function nextFileTreeSelection(
  current: ReadonlySet<string>, anchorPath: string | null, clickedPath: string,
  visiblePaths: string[], individual: boolean, range: boolean,
): { selected: Set<string>; anchorPath: string } {
  if (range && anchorPath) {
    const start = visiblePaths.indexOf(anchorPath);
    const end = visiblePaths.indexOf(clickedPath);
    if (start >= 0 && end >= 0) {
      const selected = new Set(current);
      for (const path of visiblePaths.slice(Math.min(start, end), Math.max(start, end) + 1)) selected.add(path);
      return { selected, anchorPath };
    }
  }
  if (individual) {
    const selected = new Set(current);
    selected.has(clickedPath) ? selected.delete(clickedPath) : selected.add(clickedPath);
    return { selected, anchorPath: clickedPath };
  }
  return { selected: new Set([clickedPath]), anchorPath: clickedPath };
}
