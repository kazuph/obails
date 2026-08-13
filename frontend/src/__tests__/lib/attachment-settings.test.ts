import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_LOCATION_OPTIONS,
  attachmentLocationNeedsFolder,
} from "../../lib/attachment-settings";

describe("attachment destination settings", () => {
  it("exposes all four Obsidian-compatible attachment locations", () => {
    expect(ATTACHMENT_LOCATION_OPTIONS.map((option) => option.value)).toEqual([
      "vault_root",
      "vault_folder",
      "current_folder",
      "current_subfolder",
    ]);
  });

  it("requires a folder only for vault folder and current-note subfolder modes", () => {
    expect(attachmentLocationNeedsFolder("vault_root")).toBe(false);
    expect(attachmentLocationNeedsFolder("current_folder")).toBe(false);
    expect(attachmentLocationNeedsFolder("vault_folder")).toBe(true);
    expect(attachmentLocationNeedsFolder("current_subfolder")).toBe(true);
  });
});
