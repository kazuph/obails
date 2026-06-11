import { describe, expect, it } from "vitest";
import {
  getAudioFolderQueue,
  getNextAudioPath,
  loadAudioLoopMode,
  loadDoneAudioPaths,
  storeAudioLoopMode,
  storeDoneAudioPaths,
} from "../../lib/audio-playback";
import type { SortableFileInfo } from "../../lib/file-tree-ops";

describe("audio-playback", () => {
  it("builds an audio queue from the current folder in rendered order", () => {
    const tree = [
      folder("recordings", [
        file("recordings/001.wav", "audio"),
        file("recordings/002.wav", "audio"),
        file("recordings/memo.md", "markdown"),
        file("recordings/003.wav", "audio"),
      ]),
      folder("other", [
        file("other/001.wav", "audio"),
      ]),
    ];

    expect(getAudioFolderQueue(tree, "recordings/001.wav")).toEqual([
      "recordings/001.wav",
      "recordings/002.wav",
      "recordings/003.wav",
    ]);
  });

  it("moves to the next audio in loop mode", () => {
    const tree = [
      folder("recordings", [
        file("recordings/001.wav", "audio"),
        file("recordings/002.wav", "audio"),
      ]),
    ];

    expect(getNextAudioPath(tree, "recordings/001.wav", "loop")).toBe("recordings/002.wav");
    expect(getNextAudioPath(tree, "recordings/002.wav", "loop")).toBe("recordings/001.wav");
  });

  it("repeats the same audio in one-loop mode", () => {
    const tree = [
      folder("recordings", [
        file("recordings/001.wav", "audio"),
        file("recordings/002.wav", "audio"),
      ]),
    ];

    expect(getNextAudioPath(tree, "recordings/001.wav", "one")).toBe("recordings/001.wav");
  });

  it("loads and stores loop mode", () => {
    const storage = new MemoryStorage();

    expect(loadAudioLoopMode(storage)).toBe("loop");
    storeAudioLoopMode(storage, "one");
    expect(loadAudioLoopMode(storage)).toBe("one");
  });

  it("loads and stores done paths", () => {
    const storage = new MemoryStorage();
    const done = new Set(["recordings/002.wav", "recordings/001.wav"]);

    storeDoneAudioPaths(storage, done);

    expect(Array.from(loadDoneAudioPaths(storage))).toEqual([
      "recordings/001.wav",
      "recordings/002.wav",
    ]);
  });
});

function file(path: string, fileType: string): SortableFileInfo {
  return {
    name: path.split("/").pop() || path,
    path,
    isDir: false,
    fileType,
    children: null,
  };
}

function folder(path: string, children: SortableFileInfo[]): SortableFileInfo {
  return {
    name: path.split("/").pop() || path,
    path,
    isDir: true,
    children,
  };
}

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
