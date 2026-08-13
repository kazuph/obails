import { expect, test } from "@playwright/test";

test.describe("Link navigation UI semantics", () => {
  test("exposes keyboard-selectable wiki-link suggestions and a confirmed create dialog", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const suggestions = page.locator("#link-suggestions");
    await expect(suggestions).toHaveAttribute("role", "listbox");
    await expect(suggestions).toHaveAttribute("aria-label", "Wiki link suggestions");

    const dialog = page.locator("#broken-link-overlay");
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "broken-link-title");
    await expect(page.locator("#broken-link-title")).toHaveText("Create linked note?");
    await expect(dialog.getByRole("button", { name: "Cancel", includeHidden: true })).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "Create note", includeHidden: true })).toHaveCount(1);
  });
});
