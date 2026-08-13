import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ATTACHMENT_LOCATION_OPTIONS } from "../../lib/attachment-settings";

const indexHtml = readFileSync(resolve(__dirname, "../../../index.html"), "utf8");

function parseIndexHtml(): Document {
  return new DOMParser().parseFromString(indexHtml, "text/html");
}

describe("Wave A static UI contract", () => {
  it("exposes save failure recovery controls for Markdown and HTML editors", () => {
    const documentRef = parseIndexHtml();

    for (const prefix of ["save-status", "html-save-status"]) {
      const status = documentRef.getElementById(prefix);
      expect(status?.getAttribute("role")).toBe("status");
      expect(status?.hasAttribute("hidden")).toBe(true);
      expect(documentRef.getElementById(`${prefix}-message`)).not.toBeNull();
      for (const action of ["retry", "reload", "close"]) {
        const button = documentRef.getElementById(`${prefix}-${action}`) as HTMLButtonElement | null;
        expect(button?.type).toBe("button");
        expect(button?.hasAttribute("hidden")).toBe(true);
      }
    }

    expect(documentRef.getElementById("save-status-retry")?.textContent).toBe("Retry save");
    expect(documentRef.getElementById("save-status-reload")?.textContent).toBe("Reload disk version");
    expect(documentRef.getElementById("save-status-close")?.textContent).toBe("Close document");
    expect(documentRef.getElementById("html-save-status-retry")?.textContent).toBe("Retry save");
    expect(documentRef.getElementById("html-save-status-reload")?.textContent).toBe("Reload disk version");
    expect(documentRef.getElementById("html-save-status-close")?.textContent).toBe("Close document");
  });

  it("exposes the Markdown attachment drop target and new-note filename input", () => {
    const documentRef = parseIndexHtml();
    const editor = documentRef.getElementById("editor");

    expect(editor?.getAttribute("data-drop-kind")).toBe("markdown-editor");
    expect(editor?.hasAttribute("data-file-drop-target")).toBe(true);

    const newNoteInput = documentRef.getElementById("new-note-input") as HTMLInputElement | null;
    expect(newNoteInput?.getAttribute("aria-label")).toBe("New note filename");
    expect(newNoteInput?.getAttribute("autocomplete")).toBe("off");
    expect(documentRef.getElementById("new-note-create")?.textContent).toBe("Create");
    expect(documentRef.getElementById("new-note-extension")?.textContent).toBe(".md");
  });

  it("exposes the attachment destination settings shell and four Obsidian-compatible choices", () => {
    const documentRef = parseIndexHtml();

    expect(documentRef.getElementById("settings-attachment-location")?.tagName).toBe("SELECT");
    expect(documentRef.getElementById("settings-attachment-folder-row")?.hasAttribute("hidden")).toBe(true);
    expect(documentRef.getElementById("settings-attachment-location")?.closest("label")?.textContent)
      .toContain("Store new attachments in");

    expect(ATTACHMENT_LOCATION_OPTIONS).toEqual([
      { value: "vault_root", label: "Vault root" },
      { value: "vault_folder", label: "Specified vault folder" },
      { value: "current_folder", label: "Current note folder" },
      { value: "current_subfolder", label: "Subfolder under current note" },
    ]);
  });

  it("reserves the command shortcut help region used for Save Current File", () => {
    const documentRef = parseIndexHtml();
    const help = documentRef.getElementById("command-shortcuts-help");

    expect(help?.querySelector("h3")?.textContent).toBe("Commands");
    expect(documentRef.getElementById("shortcuts-overlay")?.getAttribute("role")).toBe("dialog");
  });
});
