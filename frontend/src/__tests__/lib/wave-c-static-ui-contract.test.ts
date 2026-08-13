import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(resolve(__dirname, "../../../index.html"), "utf8");
const distIndexPath = resolve(__dirname, "../../../dist/index.html");

function parseIndexHtml(source = indexHtml): Document {
  return new DOMParser().parseFromString(source, "text/html");
}

describe("Wave C static UI contract", () => {
  it("exposes graph filter controls for unresolved links, attachments, orphans, tags, and search", () => {
    const documentRef = parseIndexHtml();
    const filters = documentRef.getElementById("graph-filters");

    expect(filters?.getAttribute("aria-label")).toBe("Graph filters");
    expect(documentRef.getElementById("graph-include-unresolved")?.closest("label")?.textContent)
      .toContain("Unresolved links");
    expect(documentRef.getElementById("graph-include-attachments")?.closest("label")?.textContent)
      .toContain("Attachments");
    expect(documentRef.getElementById("graph-exclude-orphans")?.closest("label")?.textContent)
      .toContain("Hide orphans");
    expect(documentRef.getElementById("graph-include-tags")?.getAttribute("placeholder"))
      .toContain("project");
    expect(documentRef.getElementById("graph-exclude-tags")?.getAttribute("placeholder"))
      .toContain("archive");
    expect(documentRef.getElementById("graph-search")?.getAttribute("type")).toBe("search");
  });

  it("exposes local graph root path and depth controls", () => {
    const documentRef = parseIndexHtml();
    const depth = documentRef.getElementById("graph-depth");

    expect(documentRef.getElementById("graph-root-path")?.getAttribute("placeholder")).toBe("note.md");
    expect(depth?.getAttribute("aria-label")).toBe("Local graph depth");
    expect(Array.from(depth?.querySelectorAll("option") ?? []).map((option) => option.getAttribute("value")))
      .toEqual(["0", "1", "2"]);
  });

  it("exposes graph keyboard navigation and selected-node context actions", () => {
    const documentRef = parseIndexHtml();
    const nodeList = documentRef.getElementById("graph-node-list");

    expect(nodeList?.getAttribute("role")).toBe("listbox");
    expect(nodeList?.getAttribute("aria-label")).toBe("Graph nodes");
    expect(documentRef.querySelector(".graph-node-help")?.textContent)
      .toContain("Up/Down");
    expect(documentRef.querySelector(".graph-node-help")?.textContent)
      .toContain("Left/Right");
    expect(documentRef.getElementById("graph-open-note")?.textContent).toBe("Open note");
    expect(documentRef.getElementById("graph-local-node")?.textContent).toBe("Local graph");
    expect(documentRef.getElementById("graph-copy-path")?.textContent).toBe("Copy path");
    expect(documentRef.getElementById("graph-incoming")?.textContent).toContain("Incoming:");
    expect(documentRef.getElementById("graph-outgoing")?.textContent).toContain("Outgoing:");
  });

  it("exposes vault search controls separate from Quick Switcher and Explorer filter", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("vault-search-overlay")?.getAttribute("role")).toBe("dialog");
    expect(documentRef.getElementById("vault-search-title")?.textContent).toBe("Search vault");
    expect(documentRef.getElementById("vault-search-input")?.getAttribute("placeholder"))
      .toContain("tag:#work");
    expect(documentRef.getElementById("vault-search-sort")?.querySelectorAll("option").length).toBe(4);
    expect(documentRef.getElementById("vault-search-context")?.getAttribute("min")).toBe("0");
    expect(documentRef.getElementById("vault-search-context-help")?.textContent)
      .toContain("complete matching line");
    expect(documentRef.getElementById("vault-search-help")?.textContent)
      .toContain("20 supported syntax families");

    expect(documentRef.getElementById("quick-switcher-overlay")?.getAttribute("role")).toBe("dialog");
    expect(documentRef.getElementById("quick-switcher-title")?.textContent).toBe("Quick Switcher");
    expect(documentRef.getElementById("file-search-input")?.getAttribute("aria-label")).toBe("Search files");
    expect(documentRef.getElementById("quick-switcher-input")?.getAttribute("placeholder"))
      .toContain("alias");
    expect(documentRef.querySelector(".quick-switcher-help")?.textContent)
      .toContain("Shift");
  });

  it("retains Wave C contract markers in production dist when built", () => {
    expect(existsSync(distIndexPath)).toBe(true);

    const distHtml = readFileSync(distIndexPath, "utf8");
    const documentRef = parseIndexHtml(distHtml);

    expect(distHtml).toContain("Knowledge Graph");
    expect(distHtml).toContain("Search vault");
    expect(distHtml).toContain("Quick Switcher");
    expect(distHtml).toContain("Search files...");
    expect(documentRef.getElementById("graph-depth")?.getAttribute("aria-label")).toBe("Local graph depth");
    expect(documentRef.getElementById("vault-search-context-help")?.textContent)
      .toContain("complete matching line");
    expect(documentRef.getElementById("graph-node-list")?.getAttribute("role")).toBe("listbox");
  });
});
