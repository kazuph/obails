import { afterEach, describe, expect, it } from "vitest";
import { createRichSurface } from "../../lib/rich-surface-factory";

const buttonNames = [
  "Retry save",
  "Reload disk version",
  "Close document",
  "Previous match",
  "Next match",
  "Close find",
  "View image fullscreen",
  "Toggle PDF view mode",
  "Previous PDF page",
  "Next PDF page",
  "Zoom out PDF",
  "Zoom in PDF",
  "View PDF fullscreen",
  "Retry save",
  "Reload disk version",
  "Close document",
  "Post",
  "Toggle Outline",
  "Toggle Outgoing Links",
  "Toggle Backlinks",
];

afterEach(() => {
  document.body.replaceChildren();
});

describe("createRichSurface", () => {
  it("creates the complete rich document controls with their accessible roles and names", () => {
    const surface = createRichSurface(document, "left");
    document.body.append(surface.root);

    expect(surface.root.getAttribute("aria-label")).toBe("Document pane left");
    expect(surface.root.getAttribute("role")).toBe("region");
    expect(surface.editor.getAttribute("aria-label")).toBe("Editor in pane left");
    expect(surface.htmlEditor.getAttribute("aria-label")).toBe("HTML editor in pane left");
    expect(surface.root.querySelectorAll("textarea")).toHaveLength(3);
    expect(surface.root.querySelectorAll("audio")).toHaveLength(1);
    expect(surface.audioPlayer.getAttribute("aria-label")).toBe("Audio player");
    expect(surface.root.querySelectorAll(".editor-line-numbers[aria-hidden=true]")).toHaveLength(2);
    expect(surface.root.querySelectorAll(".pdf-container")).toHaveLength(2);
    expect(surface.pdfContainerA.classList.contains("pdf-buffer-active")).toBe(true);
    expect(surface.pdfContainerB.classList.contains("pdf-buffer-back")).toBe(true);
    expect(surface.root.querySelectorAll('[role="status"]')).toHaveLength(2);
    expect(surface.preview.classList.contains("preview-content")).toBe(true);
    expect(surface.savePulse.classList.contains("save-pulse")).toBe(true);
    expect(surface.savePulse.getAttribute("aria-hidden")).toBe("true");
    expect(surface.editorTitle.classList.contains("standalone-note-title")).toBe(true);
    expect(surface.editorTitle.hidden).toBe(true);
    expect(surface.previewTitle.classList.contains("standalone-note-title")).toBe(true);
    expect(surface.previewTitle.hidden).toBe(true);
    expect(surface.previewTitle.textContent).toBe("Preview");
    expect(surface.markdownSaveConflict.status.hidden).toBe(true);
    expect(surface.linkSuggestions.getAttribute("role")).toBe("listbox");
    expect(surface.linkSuggestions.getAttribute("aria-label")).toBe("Wiki link suggestions");
    expect(surface.noteSearchInput.getAttribute("type")).toBe("search");
    expect(surface.noteSearchInput.classList.contains("note-search-input")).toBe(true);
    expect(surface.pdfPageInfo.classList.contains("pdf-page-info")).toBe(true);
    expect(surface.pdfZoomInfo.classList.contains("pdf-zoom-info")).toBe(true);
    expect(surface.htmlPreview.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(surface.root.querySelectorAll('[role="separator"]')).toHaveLength(5);

    const controls = [...surface.root.querySelectorAll<HTMLButtonElement>('button[type="button"]')];
    expect(controls).toHaveLength(buttonNames.length);
    expect(controls.map((control) => control.getAttribute("aria-label"))).toEqual(buttonNames);
    expect(surface.outlineToggleButton.getAttribute("aria-expanded")).toBe("true");
    expect(surface.outgoingLinksToggleButton.getAttribute("aria-expanded")).toBe("true");
    expect(surface.backlinksToggleButton.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps two panes isolated and creates no IDs that can collide", () => {
    const left = createRichSurface(document, "left");
    const right = createRichSurface(document, "right");
    document.body.append(left.root, right.root);

    expect(left.root).not.toBe(right.root);
    expect(left.editor).not.toBe(right.editor);
    expect(left.preview).not.toBe(right.preview);
    expect(left.imagePreview).not.toBe(right.imagePreview);
    expect(left.pdfContainerA).not.toBe(right.pdfContainerA);
    expect(left.htmlPreview).not.toBe(right.htmlPreview);
    expect(left.audioPlayer).not.toBe(right.audioPlayer);
    expect(left.rightSidebar).not.toBe(right.rightSidebar);
    expect(left.root.dataset.paneId).toBe("left");
    expect(right.root.dataset.paneId).toBe("right");
    expect(left.root.querySelector('[data-pane-id="right"]')).toBeNull();
    expect(right.root.querySelector('[data-pane-id="left"]')).toBeNull();
    expect(document.querySelectorAll("[id]")).toHaveLength(0);

    left.editor.value = "left content";
    left.pdfContainerA.append(document.createElement("canvas"));
    left.outlineToggleButton.setAttribute("aria-expanded", "false");
    expect(right.editor.value).toBe("");
    expect(right.pdfContainerA.childElementCount).toBe(0);
    expect(right.outlineToggleButton.getAttribute("aria-expanded")).toBe("true");
  });
});
