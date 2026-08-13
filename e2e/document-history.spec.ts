import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const fixtureVaultPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/test-vault");
const undoShortcut = process.platform === "darwin" ? "Meta+Z" : "Control+Z";
const redoShortcut = process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Y";

test("keeps a note's undo and redo history after ordinary navigation", async ({ page }) => {
  const suffix = Date.now();
  const firstName = `p012-first-${suffix}.md`;
  const secondName = `p012-second-${suffix}.md`;
  const firstPath = path.join(fixtureVaultPath, firstName);
  const secondPath = path.join(fixtureVaultPath, secondName);
  await Promise.all([
    writeFile(firstPath, "initial", "utf8"),
    writeFile(secondPath, "other note", "utf8"),
  ]);

  try {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator(`.file-item[data-path="${firstName}"]`).click();
    const editor = page.locator("#editor");
    if (await editor.isHidden()) {
      await page.getByRole("button", { name: "Toggle Source" }).click();
    }
    await editor.fill("first edit");
    await editor.fill("second edit");

    await page.locator(`.file-item[data-path="${secondName}"]`).click();
    await page.locator(`.file-item[data-path="${firstName}"]`).click();
    await editor.focus();
    await page.keyboard.press(undoShortcut);
    await expect(editor).toHaveValue("first edit");
    await page.keyboard.press(redoShortcut);
    await expect(editor).toHaveValue("second edit");
  } finally {
    await Promise.all([rm(firstPath, { force: true }), rm(secondPath, { force: true })]);
  }
});
