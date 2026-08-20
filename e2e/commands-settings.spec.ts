import { expect, test } from "@playwright/test";
import { openCommandPaletteWithHotkey, setupMockBindings, waitForAppCommands } from "./helpers/mock-bindings";

test("command palette executes one command, preserves typing, and closes one overlay at a time", async ({ page }) => {
  await setupMockBindings(page);
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await waitForAppCommands(page);
  await openCommandPaletteWithHotkey(page);
  const palette = page.getByRole("dialog", { name: "Command Palette" });
  const search = page.getByLabel("Search commands");
  await expect(palette).toBeVisible();
  await search.fill("Settings");
  const selected = palette.getByRole("option", { selected: true });
  await expect(selected).toContainText("Settings");
  await expect(selected).toHaveCSS("outline-style", "solid");
  const optionBoxes = await palette.getByRole("option").evaluateAll((options) =>
    options.map((option) => {
      const bounds = option.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, width: bounds.width };
    }),
  );
  expect(optionBoxes.every((box) => box.width > 0)).toBe(true);
  expect(optionBoxes.every((box, index) => index === 0 || box.top >= optionBoxes[index - 1].bottom)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();

  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Font family")).toBeVisible();
  await expect(page.locator("#settings-theme option")).toHaveCount(14);
  await expect(page.locator("#settings-theme optgroup")).toHaveCount(3);
  await expect(page.locator("#settings-theme")).not.toHaveValue("");
  await expect(page.getByRole("group", { name: "Keyboard shortcuts" })).toBeVisible();
  const hotkeyRows = await page.locator(".hotkey-settings-row").evaluateAll((rows) =>
    rows.map((row) => Array.from(row.children).map((child) => {
      const bounds = child.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right };
    })),
  );
  expect(hotkeyRows.every((row) => row.length === 3 && row[0].right <= row[1].left && row[1].right <= row[2].left)).toBe(true);
  const sidebarWidth = page.getByLabel("Default sidebar width");
  const persistedWidth = await sidebarWidth.inputValue();
  await sidebarWidth.fill("501");
  await sidebarWidth.press("Tab");
  await expect(page.locator("#settings-status")).toContainText("Sidebar width saved.");
  await expect(sidebarWidth).toHaveValue("501");
  await sidebarWidth.fill(persistedWidth);
  await sidebarWidth.press("Tab");
  await expect(page.locator("#settings-status")).toContainText("Sidebar width saved.");
  await openCommandPaletteWithHotkey(page);
  await search.pressSequentially("?");
  await expect(search).toHaveValue("?");
  await expect(page.locator("#shortcuts-overlay")).not.toHaveClass(/visible/);
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(settings).toBeVisible();
});
