import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { setupMockBindings } from "./helpers/mock-bindings";

const fixtureVaultPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/test-vault");
const undoShortcut = process.platform === "darwin" ? "Meta+Z" : "Control+Z";
const redoShortcut = process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Y";

function activeMarkdownEditor(page: import("@playwright/test").Page) {
  return page.locator('.workspace-pane-slot[data-active="true"] textarea[aria-label^="Editor in pane"]').first();
}

async function replaceActiveMarkdownContent(page: import("@playwright/test").Page, content: string) {
  const editor = activeMarkdownEditor(page);
  await editor.evaluate((element, value) => {
    const textarea = element as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    textarea.focus();
    if (setter) {
      setter.call(textarea, value);
    } else {
      textarea.value = value;
    }
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }, content);
  await expect(editor).toHaveValue(content);
}

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
    await setupMockBindings(page);
    await page.goto("/");
    await page.locator("html[data-app-ready='true']").waitFor();
    await page.locator(`.file-item[data-path="${firstName}"]`).click();
    const editor = activeMarkdownEditor(page);
    if (await editor.isHidden()) {
      await page.locator('.workspace-pane-slot[data-active="true"] .rich-surface').first().hover();
      await page.getByRole("button", { name: "Toggle Source" }).click();
    }
    await replaceActiveMarkdownContent(page, "first edit");
    await replaceActiveMarkdownContent(page, "second edit");

    await page.locator(`.file-item[data-path="${secondName}"]`).click();
    await expect(editor).toHaveAttribute("data-note-path", secondName);
    await page.locator(`.file-item[data-path="${firstName}"]`).click();
    await expect(editor).toHaveAttribute("data-note-path", firstName);
    await expect(editor).toHaveValue("second edit");
    await editor.focus();
    await page.keyboard.press(undoShortcut);
    await expect(editor).toHaveValue("first edit");
    await page.keyboard.press(redoShortcut);
    await expect(editor).toHaveValue("second edit");
  } finally {
    await Promise.all([rm(firstPath, { force: true }), rm(secondPath, { force: true })]);
  }
});
