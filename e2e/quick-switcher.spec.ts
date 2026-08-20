import { expect, test } from "@playwright/test";
import { dispatchGlobalHotkey, setupMockBindings, waitForAppCommands } from "./helpers/mock-bindings";

test.describe("Quick Switcher", () => {
  test("opens with the Obsidian shortcut and restores focus after Escape", async ({ page }) => {
    await setupMockBindings(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await waitForAppCommands(page);

    const newNoteButton = page.getByRole("button", { name: "New Note" });
    await newNoteButton.focus();
    await expect.poll(async () => {
      const overlay = page.locator("#quick-switcher-overlay");
      const display = await overlay.evaluate((el) => getComputedStyle(el).display);
      if (display === "none") {
        await dispatchGlobalHotkey(page, "o", { metaKey: true });
      }
      return await overlay.evaluate((el) => getComputedStyle(el).display);
    }, { timeout: 5000 }).not.toBe("none");

    const dialog = page.getByRole("dialog", { name: "Quick Switcher" });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel("Search notes by name or alias", { exact: true })).toBeFocused();
    await expect(page.getByRole("listbox", { name: "Quick switcher results" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(newNoteButton).toBeFocused();
  });
});
