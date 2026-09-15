import { afterEach, describe, expect, it } from "vitest";
import { selectNoteContents, selectNoteText } from "../../lib/note-selection";

afterEach(() => {
  document.body.replaceWith(document.createElement("body"));
  document.getSelection()?.removeAllRanges();
});

describe("note selection", () => {
  it("selects the replacement note DOM after a pane render", () => {
    const preview = document.createElement("article");
    document.body.append(preview);
    preview.textContent = "Before render";
    selectNoteContents(preview);
    preview.replaceChildren(document.createTextNode("After render"));
    selectNoteContents(preview);
    expect(document.getSelection()?.toString()).toBe("After render");
  });
  function setup(target: HTMLElement = document.body) {
    const sidebar = document.createElement("aside");
    sidebar.textContent = "Other UI";
    const preview = document.createElement("article");
    preview.innerHTML = "<h1>Note</h1><p>All paragraphs</p>";
    document.body.append(sidebar, preview);
    target.addEventListener("keydown", (event) => selectNoteText(event, preview));
    return preview;
  }

  it.each(["metaKey", "ctrlKey"])("selects only the complete note with %s", (modifier) => {
    const preview = setup();
    const event = new KeyboardEvent("keydown", { key: "a", [modifier]: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.getSelection()?.toString()).toBe(preview.textContent);
    expect(document.getSelection()?.getRangeAt(0).commonAncestorContainer).toBe(preview);
  });

  it.each(["input", "textarea", "select"])("preserves native selection in %s", (tag) => {
    const input = document.createElement(tag);
    document.body.append(input);
    setup(input);
    const event = new KeyboardEvent("keydown", { key: "a", metaKey: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(document.getSelection()?.rangeCount).toBe(0);
  });

  it.each(['<div contenteditable="true"><span>Editing</span></div>', '<div role="dialog"><span>Dialog</span></div>'])("preserves an independent editing or dialog context", (html) => {
    document.body.innerHTML = html;
    const target = document.querySelector("span")!;
    setup(target);
    const event = new KeyboardEvent("keydown", { key: "a", metaKey: true, cancelable: true });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
