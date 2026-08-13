import { describe, expect, it } from "vitest";
import { insertAttachmentEmbeds } from "../../lib/attachment-drop";

describe("insertAttachmentEmbeds", () => {
  it("replaces the current selection with ordered embeds and moves the cursor after them", () => {
    expect(insertAttachmentEmbeds("before selected after", 7, 15, ["![[one.png]]", "![[two.pdf]]"])).toEqual({
      content: "before \n![[one.png]]\n![[two.pdf]]\n after",
      selectionStart: 33,
      selectionEnd: 33,
    });
  });

  it("does not add redundant newlines at existing line boundaries", () => {
    expect(insertAttachmentEmbeds("before\n\nafter", 7, 7, ["![[image.png]]"])).toEqual({
      content: "before\n![[image.png]]\nafter",
      selectionStart: 21,
      selectionEnd: 21,
    });
  });

  it("rejects an empty attachment result instead of changing note content", () => {
    expect(() => insertAttachmentEmbeds("note", 0, 0, [])).toThrow("attachment embeds must be non-empty");
    expect(() => insertAttachmentEmbeds("note", 0, 0, [""])).toThrow("attachment embeds must be non-empty");
  });
});
