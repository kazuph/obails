import { describe, it, expect } from "vitest";
import { countMarkdownNotes, type NoteCountTreeNode } from "../../lib/file-tree-view";

const md = (path: string): NoteCountTreeNode => ({ isDir: false, fileType: "markdown", path });
const file = (path: string, fileType = "other"): NoteCountTreeNode => ({ isDir: false, fileType, path });
const dir = (path: string, children: NoteCountTreeNode[]): NoteCountTreeNode => ({ isDir: true, path, children });

describe("countMarkdownNotes", () => {
  it("counts a markdown file as one note", () => {
    expect(countMarkdownNotes(md("a.md"))).toBe(1);
  });

  it("does not count non-markdown files", () => {
    expect(countMarkdownNotes(file("photo.png", "image"))).toBe(0);
    expect(countMarkdownNotes(file("voice.wav", "audio"))).toBe(0);
  });

  it("falls back to the .md extension when fileType is missing", () => {
    expect(countMarkdownNotes({ isDir: false, path: "plain.md" })).toBe(1);
    expect(countMarkdownNotes({ isDir: false, path: "plain.txt" })).toBe(0);
  });

  it("counts notes recursively through nested folders", () => {
    const tree = dir("root", [
      md("root/a.md"),
      file("root/img.png", "image"),
      dir("root/sub", [md("root/sub/b.md"), dir("root/sub/deep", [md("root/sub/deep/c.md")])]),
    ]);
    expect(countMarkdownNotes(tree)).toBe(3);
  });

  it("returns zero for an empty folder or missing children", () => {
    expect(countMarkdownNotes(dir("empty", []))).toBe(0);
    expect(countMarkdownNotes({ isDir: true, path: "no-children" })).toBe(0);
  });

  it("excludes hidden files and every note below a dot folder", () => {
    const tree = dir("root", [
      md("root/visible.md"),
      md("root/.hidden.md"),
      dir("root/.obsidian", [md("root/.obsidian/internal.md")]),
      dir("root/visible", [md("root/visible/note.md")]),
    ]);

    expect(countMarkdownNotes(tree)).toBe(2);
  });
});
