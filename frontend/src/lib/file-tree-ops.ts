export type ItemKind = "file" | "folder";

const INVALID_NAME_CHARS = /[<>:"/\\|?*]/;

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
  const ext = getFileExtension(path);
  return ext ? basename.slice(0, -ext.length) : basename;
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
