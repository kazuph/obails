import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DELETE_MODES } from "../../lib/delete-mode";

const indexHtml = readFileSync(resolve(__dirname, "../../../index.html"), "utf8");
const distIndexPath = resolve(__dirname, "../../../dist/index.html");

function parseIndexHtml(source = indexHtml): Document {
  return new DOMParser().parseFromString(source, "text/html");
}

describe("Wave E static UI contract", () => {
  it("exposes delete confirmation dialog with destination-aware messaging shell", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("delete-confirm-overlay")?.getAttribute("role")).toBe("dialog");
    expect(documentRef.getElementById("delete-confirm-title")?.textContent).toBe("Delete Item?");
    expect(documentRef.getElementById("delete-confirm-message")?.textContent)
      .toContain("Are you sure you want to delete this item?");
    expect(documentRef.getElementById("delete-confirm-cancel")?.textContent).toBe("Cancel");
    expect(documentRef.getElementById("delete-confirm-submit")?.textContent).toBe("Delete");
  });

  it("exposes every supported delete mode with irreversible permanent labeling", () => {
    const documentRef = parseIndexHtml();
    const options = Array.from(
      documentRef.querySelectorAll<HTMLInputElement>('input[name="delete-mode"]'),
    );

    expect(documentRef.getElementById("delete-mode-options")?.tagName).toBe("FIELDSET");
    expect(options.map((input) => input.value)).toEqual([...DELETE_MODES]);
    expect(options.find((input) => input.value === "system_trash")?.closest("label")?.textContent)
      .toContain("system Trash");
    expect(options.find((input) => input.value === "vault_trash")?.closest("label")?.textContent)
      .toContain(".trash folder");
    expect(options.find((input) => input.value === "permanent")?.closest("label")?.textContent)
      .toContain("cannot be undone");
  });

  it("exposes command palette search and listbox shell", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("command-palette-overlay")?.getAttribute("role")).toBe("dialog");
    expect(documentRef.getElementById("command-palette-title")?.textContent).toBe("Command Palette");
    expect(documentRef.getElementById("command-palette-input")?.getAttribute("type")).toBe("search");
    expect(documentRef.getElementById("command-palette-input")?.getAttribute("aria-label")).toBe("Search commands");
    expect(documentRef.getElementById("command-palette-results")?.getAttribute("role")).toBe("listbox");
    expect(documentRef.getElementById("command-palette-results")?.getAttribute("aria-label"))
      .toBe("Available commands");
  });

  it("exposes settings shell with editor, hotkey, recovery, and sidebar controls", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("settings-overlay")?.getAttribute("role")).toBe("dialog");
    expect(documentRef.getElementById("settings-status")?.getAttribute("role")).toBe("status");
    expect(documentRef.getElementById("settings-retry")?.textContent).toBe("Retry settings");
    expect(documentRef.getElementById("settings-font-family")?.getAttribute("type")).toBe("text");
    expect(documentRef.getElementById("settings-font-size")?.getAttribute("type")).toBe("number");
    expect(documentRef.getElementById("settings-line-numbers")?.getAttribute("type")).toBe("checkbox");
    expect(documentRef.getElementById("settings-word-wrap")?.getAttribute("type")).toBe("checkbox");
    expect(documentRef.getElementById("settings-sidebar-width")?.getAttribute("min")).toBe("150");
    expect(documentRef.getElementById("settings-sidebar-width")?.getAttribute("max")).toBe("500");
    expect(documentRef.getElementById("hotkey-settings-list")?.getAttribute("role")).toBe("list");
    expect(documentRef.getElementById("recently-deleted-open")?.textContent).toBe("Recently deleted");
    expect(documentRef.getElementById("recovery-snapshots-open")?.textContent).toBe("Recovery snapshots");
    expect(documentRef.querySelector(".settings-hint")?.textContent)
      .toContain("never overwrite");
  });

  it("exposes recently deleted and recovery snapshot restore affordances", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("recently-deleted-overlay")?.getAttribute("role")).toBe("dialog");
    expect(documentRef.getElementById("recently-deleted-title")?.textContent).toBe("Recently deleted");
    expect(documentRef.getElementById("recently-deleted-status")?.getAttribute("role")).toBe("status");
    expect(documentRef.getElementById("recently-deleted-list")?.getAttribute("aria-label"))
      .toBe("Recently deleted items");

    expect(documentRef.getElementById("recovery-snapshots-overlay")?.getAttribute("role")).toBe("dialog");
    expect(documentRef.getElementById("recovery-snapshots-title")?.textContent).toBe("Recovery snapshots");
    expect(documentRef.getElementById("recovery-snapshot-retry")?.textContent).toBe("Retry snapshot");
    expect(documentRef.getElementById("recovery-snapshot-read")?.textContent).toBe("Read file contents");
    expect(documentRef.getElementById("recovery-snapshot-restore")?.textContent).toBe("Restore this file");
    expect(documentRef.getElementById("recovery-snapshot-path-help")?.textContent)
      .toContain("Read the stored contents before restoring");
  });

  it("exposes editor line-number gutters and sidebar resize handles", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("editor-line-numbers")?.classList.contains("editor-line-numbers")).toBe(true);
    expect(documentRef.getElementById("html-editor-line-numbers")?.classList.contains("editor-line-numbers")).toBe(true);
    expect(documentRef.getElementById("sidebar")?.classList.contains("sidebar")).toBe(true);
    expect(documentRef.getElementById("right-sidebar")?.classList.contains("right-sidebar")).toBe(true);
    expect(documentRef.getElementById("sidebar-resize")?.classList.contains("resize-handle")).toBe(true);
    expect(documentRef.getElementById("right-sidebar-resize")?.classList.contains("resize-handle")).toBe(true);
  });

  it("retains Wave E contract markers in production dist when built", () => {
    expect(existsSync(distIndexPath)).toBe(true);

    const distHtml = readFileSync(distIndexPath, "utf8");
    const documentRef = parseIndexHtml(distHtml);

    expect(distHtml).toContain("Delete Item?");
    expect(distHtml).toContain("Move to the system Trash");
    expect(distHtml).toContain("cannot be undone");
    expect(distHtml).toContain("Command Palette");
    expect(distHtml).toContain("Recently deleted");
    expect(distHtml).toContain("Recovery snapshots");
    expect(distHtml).toContain("Read file contents");
    expect(documentRef.getElementById("command-palette-results")?.getAttribute("role")).toBe("listbox");
    expect(documentRef.getElementById("settings-line-numbers")?.getAttribute("type")).toBe("checkbox");
    expect(documentRef.getElementById("settings-sidebar-width")?.getAttribute("max")).toBe("500");
    expect(documentRef.getElementById("editor-line-numbers")?.classList.contains("editor-line-numbers")).toBe(true);
    expect(documentRef.getElementById("sidebar-resize")?.classList.contains("resize-handle")).toBe(true);
  });
});
