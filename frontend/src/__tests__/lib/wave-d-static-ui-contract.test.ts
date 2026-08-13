import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(resolve(__dirname, "../../../index.html"), "utf8");
const distIndexPath = resolve(__dirname, "../../../dist/index.html");

function parseIndexHtml(source = indexHtml): Document {
  return new DOMParser().parseFromString(source, "text/html");
}

describe("Wave D static UI contract", () => {
  it("exposes modifier-readable file tree selection semantics", () => {
    const documentRef = parseIndexHtml();
    const tree = documentRef.getElementById("file-tree");

    expect(tree?.getAttribute("role")).toBe("tree");
    expect(tree?.getAttribute("aria-label")).toBe("File tree");
    expect(documentRef.getElementById("file-tree-sort-field")?.querySelectorAll("option").length).toBe(3);
    expect(documentRef.getElementById("file-tree-sort-direction")?.querySelectorAll("option").length).toBe(2);
  });

  it("exposes searchable move-to-folder dialog controls", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("move-to-folder-overlay")?.getAttribute("role")).toBe("dialog");
    expect(documentRef.getElementById("move-to-folder-title")?.textContent).toBe("Move to folder");
    expect(documentRef.getElementById("move-to-folder-input")?.getAttribute("type")).toBe("search");
    expect(documentRef.getElementById("move-to-folder-input")?.getAttribute("aria-label"))
      .toBe("Search destination folders");
    expect(documentRef.getElementById("move-to-folder-results")?.getAttribute("role")).toBe("listbox");
    expect(documentRef.getElementById("move-to-folder-results")?.getAttribute("aria-label"))
      .toBe("Destination folders");
    expect(documentRef.getElementById("move-to-folder-cancel")?.textContent).toBe("Cancel");
  });

  it("exposes persisted Explorer sort and auto-reveal settings", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("file-tree-sort-field")?.getAttribute("aria-label")).toBe("Sort files by");
    expect(Array.from(documentRef.getElementById("file-tree-sort-field")?.querySelectorAll("option") ?? [])
      .map((option) => option.getAttribute("value"))).toEqual(["name", "modified", "created"]);
    expect(documentRef.getElementById("file-tree-sort-direction")?.getAttribute("aria-label")).toBe("Sort direction");
    expect(documentRef.getElementById("file-tree-auto-reveal")?.getAttribute("type")).toBe("checkbox");
    expect(documentRef.getElementById("file-tree-auto-reveal")?.closest("label")?.textContent)
      .toContain("Reveal the active file");
  });

  it("retains Wave D contract markers in production dist when built", () => {
    expect(existsSync(distIndexPath)).toBe(true);

    const distHtml = readFileSync(distIndexPath, "utf8");
    const documentRef = parseIndexHtml(distHtml);

    expect(distHtml).toContain("Move to folder");
    expect(distHtml).toContain("Search destination folders");
    expect(distHtml).toContain("Reveal the active file");
    expect(documentRef.getElementById("move-to-folder-results")?.getAttribute("role")).toBe("listbox");
    expect(documentRef.getElementById("file-tree-auto-reveal")?.getAttribute("type")).toBe("checkbox");
    expect(documentRef.getElementById("file-tree-sort-field")?.getAttribute("aria-label")).toBe("Sort files by");
  });
});
