import { expect, test } from "@playwright/test";

test.describe("Attachment drop and destination settings", () => {
  test("exposes the native Markdown drop target and every configured destination", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#editor")).toHaveAttribute("data-file-drop-target", "");
    await expect(page.locator("#editor")).toHaveAttribute("data-drop-kind", "markdown-editor");

    const locations = await page.locator("#settings-attachment-location option").evaluateAll((options) => options.map((option) => ({
      value: (option as HTMLOptionElement).value,
      label: option.textContent?.trim(),
    })));
    expect(locations).toEqual([
      { value: "vault_root", label: "Vault root" },
      { value: "vault_folder", label: "Specified vault folder" },
      { value: "current_folder", label: "Current note folder" },
      { value: "current_subfolder", label: "Subfolder under current note" },
    ]);
    await expect(page.locator("#settings-attachment-folder-row")).toBeHidden();
  });
});
