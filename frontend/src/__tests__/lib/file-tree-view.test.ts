import { describe, expect, it } from "vitest";
import { appendFileTreeItemContent } from "../../lib/file-tree-view";

describe("file-tree view", () => {
  it("renders a vault filename as text rather than HTML", () => {
    const item = document.createElement("div");
    appendFileTreeItemContent(item, "<span>icon</span>", '<img src=x onerror="window.pwned=1">.md', "file", false);

    expect(item.querySelector("img")).toBeNull();
    expect(item.querySelector(".file-name")?.textContent).toBe('<img src=x onerror="window.pwned=1">');
  });

  it("hides Markdown extensions without hiding other file extensions", () => {
    const markdown = document.createElement("div");
    const text = document.createElement("div");

    appendFileTreeItemContent(markdown, "<span>icon</span>", "nested/Note.markdown", "file", false);
    appendFileTreeItemContent(text, "<span>icon</span>", "nested/Note.txt", "file", false);

    expect(markdown.querySelector(".file-name")?.textContent).toBe("Note");
    expect(text.querySelector(".file-name")?.textContent).toBe("Note.txt");
  });
});
