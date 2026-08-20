import { expect, test } from "@playwright/test";
import { setupMockBindings } from "./helpers/mock-bindings";

test.describe("File Explorer parity controls", () => {
  test("exposes deterministic sorting, searchable moves, and auto-reveal settings", async ({ page }) => {
    await setupMockBindings(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("tree", { name: "File tree" })).toBeAttached();
    const sortButton = page.getByRole("button", { name: /Sort files:/ });
    await expect(sortButton).toBeVisible();
    await sortButton.click();
    const sortMenu = page.getByRole("menu", { name: "Sort files" });
    await expect(sortMenu.getByRole("menuitemradio")).toHaveText([
      "Name A-Z",
      "Name Z-A",
      "Modified newest first",
      "Modified oldest first",
      "Created newest first",
      "Created oldest first",
    ]);
    await expect(sortMenu.getByRole("menuitemradio", { checked: true })).toHaveText("Name A-Z");
    await expect(page.getByRole("button", { name: /folders$/i })).toBeVisible();

    const moveDialog = page.getByRole("dialog", { name: "Move to folder", includeHidden: true });
    await expect(moveDialog).toBeAttached();
    await expect(moveDialog.getByLabel("Search destination folders")).toBeAttached();
    await expect(page.getByLabel("Reveal the active file in its folder")).toBeAttached();
  });
});
