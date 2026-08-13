import { expect, test } from "@playwright/test";

test.describe("Vault search", () => {
  test("opens as a separate keyboard pane with all supported search syntax visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchButton = page.getByRole("button", { name: "Search vault" });
    await searchButton.focus();
    await page.keyboard.press("Meta+Shift+F");

    const dialog = page.getByRole("dialog", { name: "Search vault" });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel("Search expression", { exact: true })).toBeFocused();
    await expect(page.getByRole("listbox", { name: "Vault search results" })).toBeVisible();
    await expect(page.getByText("Search operators (20 supported syntax families)", { exact: true })).toBeVisible();
    await expect(dialog.locator("#vault-search-help li")).toHaveCount(20);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(searchButton).toBeFocused();
  });
});
