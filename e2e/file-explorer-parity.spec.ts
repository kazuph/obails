import { expect, test } from "@playwright/test";

test.describe("File Explorer parity controls", () => {
  test("exposes deterministic sorting, searchable moves, and auto-reveal settings", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("tree", { name: "File tree" })).toBeAttached();
    await expect(page.getByLabel("Sort files by")).toHaveValue("name");
    await expect(page.getByLabel("Sort files by").locator("option")).toHaveText([
      "Name",
      "Modified",
      "Created",
    ]);
    await expect(page.getByLabel("Sort direction").locator("option")).toHaveText([
      "Ascending",
      "Descending",
    ]);

    const moveDialog = page.getByRole("dialog", { name: "Move to folder", includeHidden: true });
    await expect(moveDialog).toBeAttached();
    await expect(moveDialog.getByLabel("Search destination folders")).toBeAttached();
    await expect(page.getByLabel("Reveal the active file in its folder")).toBeAttached();
  });
});
