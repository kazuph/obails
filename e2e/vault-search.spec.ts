import { expect, test } from "@playwright/test";
import { dispatchGlobalHotkey, setupMockBindings, waitForAppCommands } from "./helpers/mock-bindings";

test.describe("Vault search", () => {
  test("opens as a separate keyboard pane with all supported search syntax visible", async ({ page }) => {
    await setupMockBindings(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await waitForAppCommands(page);

    const searchButton = page.getByRole("button", { name: "Search vault" });
    await searchButton.focus();
    await expect.poll(async () => {
      const overlay = page.locator("#vault-search-overlay");
      const display = await overlay.evaluate((el) => getComputedStyle(el).display);
      if (display === "none") {
        await dispatchGlobalHotkey(page, "f", { metaKey: true, shiftKey: true });
      }
      return await overlay.evaluate((el) => getComputedStyle(el).display);
    }, { timeout: 5000 }).not.toBe("none");

    const dialog = page.getByRole("dialog", { name: "Search vault" });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel("Search expression", { exact: true })).toBeFocused();
    await expect(page.getByRole("listbox", { name: "Vault search results" })).toBeAttached();
    await expect(page.getByText("Search operators (20 supported syntax families)", { exact: true })).toBeVisible();
    await expect(dialog.locator("#vault-search-help li")).toHaveCount(20);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(searchButton).toBeFocused();
  });
});
