import { expect, test } from "@playwright/test";

test.describe("P-082 to P-091 accessibility parity", () => {
  test("exposes live recovery status, a labeled empty-vault action, and keyboard semantics", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#file-tree-status")).toHaveAttribute("role", "status");
    await expect(page.getByRole("button", { name: "Retry loading files" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Create a note in this empty vault", includeHidden: true })).toHaveCount(1);
    await expect(page.locator("#editor-title")).toHaveAttribute("role", "button");
    await expect(page.locator("#operation-status")).toHaveAttribute("aria-live", "polite");

    const treeItems = page.getByRole("treeitem");
    if (await treeItems.count()) {
      await expect(treeItems.first()).toHaveAttribute("aria-level", "1");
      await expect(treeItems.first()).toHaveAttribute("aria-selected", /true|false/);
    }
  });

  test("names Mermaid controls and keeps context-menu items keyboard reachable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: "Zoom out Mermaid diagram", includeHidden: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Close Mermaid diagram", includeHidden: true })).toHaveCount(1);
    await expect(page.locator("#context-menu")).toHaveAttribute("role", "menu");
    await expect(page.locator("#ctx-rename")).toHaveAttribute("role", "menuitem");
  });
});
