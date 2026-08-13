import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(resolve(__dirname, "../../../index.html"), "utf8");
const distIndexPath = resolve(__dirname, "../../../dist/index.html");

function parseIndexHtml(source = indexHtml): Document {
  return new DOMParser().parseFromString(source, "text/html");
}

describe("Wave B static UI contract", () => {
  it("exposes wiki link suggestion listbox shell adjacent to the Markdown editor", () => {
    const documentRef = parseIndexHtml();
    const suggestions = documentRef.getElementById("link-suggestions");

    expect(suggestions?.classList.contains("link-suggestions")).toBe(true);
    expect(suggestions?.getAttribute("role")).toBe("listbox");
    expect(suggestions?.getAttribute("aria-label")).toBe("Wiki link suggestions");
    expect(suggestions?.hasAttribute("hidden")).toBe(true);
    expect(documentRef.getElementById("editor-pane")?.contains(suggestions)).toBe(true);
  });

  it("exposes the broken-link create dialog for unresolved internal targets", () => {
    const documentRef = parseIndexHtml();
    const overlay = documentRef.getElementById("broken-link-overlay");

    expect(overlay?.getAttribute("role")).toBe("dialog");
    expect(overlay?.getAttribute("aria-modal")).toBe("true");
    expect(overlay?.getAttribute("aria-labelledby")).toBe("broken-link-title");
    expect(overlay?.getAttribute("aria-describedby")).toBe("broken-link-description");
    expect(documentRef.getElementById("broken-link-title")?.textContent).toBe("Create linked note?");
    expect(documentRef.getElementById("broken-link-status")?.getAttribute("role")).toBe("alert");
    expect(documentRef.getElementById("broken-link-cancel")?.textContent).toBe("Cancel");
    expect(documentRef.getElementById("broken-link-create")?.textContent).toBe("Create note");
    expect(documentRef.getElementById("broken-link-create")?.classList.contains("primary-btn")).toBe(true);
  });

  it("exposes outline, outgoing, and backlinks sidebar sections with collapsible controls", () => {
    const documentRef = parseIndexHtml();

    const outlinePanel = documentRef.getElementById("outline-panel");
    expect(outlinePanel?.getAttribute("data-sidebar-section")).toBe("outline");
    expect(documentRef.querySelector("[data-sidebar-section-toggle='outline']")?.getAttribute("aria-controls"))
      .toBe("outline-list");
    expect(documentRef.getElementById("outline-list")?.classList.contains("sidebar-section-body")).toBe(true);

    const outgoingPanel = documentRef.getElementById("outgoing-links-panel");
    expect(outgoingPanel?.getAttribute("data-sidebar-section")).toBe("outgoing");
    expect(documentRef.querySelector("[data-sidebar-section-toggle='outgoing']")?.textContent)
      .toContain("Outgoing Links");
    expect(documentRef.querySelector("[data-sidebar-section-toggle='outgoing']")?.getAttribute("aria-controls"))
      .toBe("outgoing-links-list");

    const backlinksPanel = documentRef.getElementById("backlinks-panel");
    expect(backlinksPanel?.getAttribute("data-sidebar-section")).toBe("backlinks");
    expect(documentRef.querySelector("[data-sidebar-section-toggle='backlinks']")?.textContent)
      .toContain("Backlinks");
    expect(documentRef.querySelector("[data-sidebar-section-toggle='backlinks']")?.getAttribute("aria-controls"))
      .toBe("backlinks-list");
  });

  it("exposes graph filter controls for unresolved links, attachments, orphans, and tag search", () => {
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

  it("retains Wave B contract markers in production dist when built", () => {
    expect(existsSync(distIndexPath)).toBe(true);

    const distHtml = readFileSync(distIndexPath, "utf8");
    const documentRef = parseIndexHtml(distHtml);

    expect(distHtml).toContain("Wiki link suggestions");
    expect(distHtml).toContain("Create linked note?");
    expect(distHtml).toContain("Outgoing Links");
    expect(distHtml).toContain("Backlinks");
    expect(documentRef.getElementById("link-suggestions")?.getAttribute("aria-label"))
      .toBe("Wiki link suggestions");
    expect(documentRef.getElementById("broken-link-overlay")?.getAttribute("role")).toBe("dialog");
  });
});
