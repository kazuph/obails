import { describe, expect, it } from "vitest";
import { lastImportedMarkdownPath } from "../../lib/import-flow";

describe("lastImportedMarkdownPath", () => {
  const isMarkdownPath = (path: string) => /\.md$/i.test(path);

  it("selects the final Markdown file from either import result list", () => {
    expect(lastImportedMarkdownPath(["first.txt", "last.md"], isMarkdownPath)).toBe("last.md");
  });

  it("opens the final Markdown import even when a later attachment was imported", () => {
    expect(lastImportedMarkdownPath(["note.md", "image.png"], isMarkdownPath)).toBe("note.md");
  });

  it("does not select a path when no Markdown file was imported", () => {
    expect(lastImportedMarkdownPath(["image.png"], isMarkdownPath)).toBeNull();
  });
});
