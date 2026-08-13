import { describe, expect, it } from "vitest";
import { clampEditorViewState } from "../../lib/editor-view-state";

describe("clampEditorViewState", () => {
  it("preserves a valid selection and scroll position", () => {
    expect(clampEditorViewState({ selectionStart: 2, selectionEnd: 5, scrollTop: 40 }, 10, 80))
      .toEqual({ selectionStart: 2, selectionEnd: 5, scrollTop: 40 });
  });

  it("clamps a selection and scroll position after external content becomes shorter", () => {
    expect(clampEditorViewState({ selectionStart: 18, selectionEnd: 24, scrollTop: 200 }, 12, 90))
      .toEqual({ selectionStart: 12, selectionEnd: 12, scrollTop: 90 });
  });
});
