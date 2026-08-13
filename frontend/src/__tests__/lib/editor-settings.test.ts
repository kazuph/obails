import { describe, expect, it } from "vitest";
import { editorSettingsStyle } from "../../lib/editor-settings";
describe("editor settings", () => {
  it("uses measured-editor compatible wrapping styles", () => {
    expect(editorSettingsStyle({ fontFamily: "monospace", fontSize: 14, lineNumbers: true, wordWrap: true })).toMatchObject({ fontFamily: "monospace", fontSize: "14px", whiteSpace: "pre-wrap" });
    expect(editorSettingsStyle({ fontFamily: "monospace", fontSize: 14, lineNumbers: false, wordWrap: false }).whiteSpace).toBe("pre");
  });
});
