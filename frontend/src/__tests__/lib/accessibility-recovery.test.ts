import { describe, expect, it } from "vitest";
import { describeTreeItem, moveMenuIndex } from "../../lib/accessibility-recovery";

describe("P-085/P-086 accessibility recovery helpers", () => {
  it("distinguishes folders and files with the required tree level", () => {
    expect(describeTreeItem("notes", true, 2, true)).toEqual({
      level: 2,
      label: "Folder: notes",
      expanded: "true",
    });
    expect(describeTreeItem("plan.md", false, 3)).toEqual({ level: 3, label: "File: plan.md" });
  });

  it("wraps context-menu navigation and honors Home and End", () => {
    expect(moveMenuIndex(0, 3, "ArrowUp")).toBe(2);
    expect(moveMenuIndex(2, 3, "ArrowDown")).toBe(0);
    expect(moveMenuIndex(1, 3, "Home")).toBe(0);
    expect(moveMenuIndex(1, 3, "End")).toBe(2);
  });
});
