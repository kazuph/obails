import { expect, test } from "@playwright/test";

test.describe("Quick Switcher", () => {
  test("opens with the Obsidian shortcut and restores focus after Escape", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const newNoteButton = page.getByRole("button", { name: "New Note" });
    await newNoteButton.focus();
    await page.keyboard.press("Meta+O");

    const dialog = page.getByRole("dialog", { name: "Quick Switcher" });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel("Search notes by name or alias", { exact: true })).toBeFocused();
    await expect(page.getByRole("listbox", { name: "Quick switcher results" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(newNoteButton).toBeFocused();
  });
});
