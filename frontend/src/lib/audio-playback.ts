import type { SortableFileInfo } from "./file-tree-ops";

export type AudioLoopMode = "loop" | "one";

const AUDIO_LOOP_MODE_STORAGE_KEY = "obails.audioLoopMode";
const AUDIO_DONE_STORAGE_KEY = "obails.audioDonePaths";
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "ogg", "flac", "aac", "opus"]);

export function getAudioFolderQueue(files: SortableFileInfo[], currentPath: string): string[] {
  const parentPath = getParentPath(currentPath);
  return flattenFileTree(files)
    .filter((file) => !file.isDir)
    .filter((file) => getParentPath(file.path) === parentPath)
    .filter(isAudioFile)
    .map((file) => file.path);
}

export function getNextAudioPath(
  files: SortableFileInfo[],
  currentPath: string,
  loopMode: AudioLoopMode
): string | null {
  if (loopMode === "one") {
    return currentPath;
  }

  const queue = getAudioFolderQueue(files, currentPath);
  const index = queue.indexOf(currentPath);
  if (index === -1 || queue.length === 0) {
    return null;
  }
  if (index < queue.length - 1) {
    return queue[index + 1];
  }
  return queue[0] || null;
}

export function loadAudioLoopMode(storage: Pick<Storage, "getItem">): AudioLoopMode {
  return normalizeAudioLoopMode(storage.getItem(AUDIO_LOOP_MODE_STORAGE_KEY));
}

export function storeAudioLoopMode(storage: Pick<Storage, "setItem">, mode: AudioLoopMode) {
  storage.setItem(AUDIO_LOOP_MODE_STORAGE_KEY, mode);
}

export function normalizeAudioLoopMode(value: string | null | undefined): AudioLoopMode {
  return value === "one" ? "one" : "loop";
}

export function loadDoneAudioPaths(storage: Pick<Storage, "getItem">): Set<string> {
  const raw = storage.getItem(AUDIO_DONE_STORAGE_KEY);
  if (!raw) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((path): path is string => typeof path === "string") : []);
  } catch {
    return new Set();
  }
}

export function storeDoneAudioPaths(storage: Pick<Storage, "setItem">, paths: Set<string>) {
  storage.setItem(AUDIO_DONE_STORAGE_KEY, JSON.stringify(Array.from(paths).sort()));
}

function flattenFileTree(files: SortableFileInfo[]): SortableFileInfo[] {
  const result: SortableFileInfo[] = [];

  const walk = (nodes: SortableFileInfo[]) => {
    for (const node of nodes) {
      result.push(node);
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };

  walk(files);
  return result;
}

function getParentPath(path: string): string {
  const lastSlashIndex = path.lastIndexOf("/");
  return lastSlashIndex === -1 ? "" : path.slice(0, lastSlashIndex);
}

function isAudioFile(file: SortableFileInfo): boolean {
  if ((file.fileType || "").toLowerCase() === "audio") {
    return true;
  }
  const ext = file.path.split(".").pop()?.toLowerCase() || "";
  return AUDIO_EXTENSIONS.has(ext);
}
