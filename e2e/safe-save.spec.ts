import { readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { dispatchGlobalHotkey, openCommandPaletteWithHotkey, setupMockBindings } from "./helpers/mock-bindings";

const fixtureVaultPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/test-vault");
const autosaveAndWatcherSettleMs = 500 + 350;

function fixturePath(name: string): string {
  return path.join(fixtureVaultPath, name);
}

async function openFixture(page: Page, name: string) {
  const fileItem = page.locator(`.file-item[data-path="${name}"]`);
  await expect(fileItem).toBeVisible();
  await fileItem.click();
  if (name.endsWith(".html")) {
    await expect(activeHtmlEditor(page)).toHaveValue(await readFile(fixturePath(name), "utf8"));
    return;
  }
  await showSourceEditor(page);
  await expect(activeEditor(page)).toHaveValue(await readFile(fixturePath(name), "utf8"));
}

function activeEditor(page: Page) {
  return page.locator('.workspace-pane-slot[data-active="true"] textarea[aria-label^="Editor in pane"]').first();
}

function activeHtmlEditor(page: Page) {
  return page.locator('.workspace-pane-slot[data-active="true"] textarea[aria-label^="HTML editor in pane"], #html-editor').first();
}

function activeSaveStatusMessage(page: Page) {
  return page.locator('.workspace-pane-slot[data-active="true"] .save-status-message, #save-status-message').first();
}

async function showSourceEditor(page: Page) {
  const editor = activeEditor(page);
  if (!(await editor.isVisible())) {
    const toggle = page.locator('.workspace-pane-slot[data-active="true"] [data-pane-action="source-toggle"]').first();
    if (await toggle.count()) {
      await toggle.click();
    }
    if (!(await editor.isVisible())) {
      await dispatchGlobalHotkey(page, "e", process.platform === "darwin" ? { metaKey: true } : { ctrlKey: true });
    }
  }
  await expect(editor).toBeVisible();
}

async function editAndOpenInSameRendererTask(page: Page, content: string, targetName: string) {
  await activeEditor(page).evaluate((element, payload) => {
    const editor = element as HTMLTextAreaElement;
    editor.value = payload.content;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    const target = Array.from(document.querySelectorAll<HTMLElement>(".file-item"))
      .find((item) => item.dataset.path === payload.targetName);
    target?.click();
  }, { content, targetName });
}

async function replaceActiveEditorContent(page: Page, content: string) {
  await activeEditor(page).evaluate((element, value) => {
    const editor = element as HTMLTextAreaElement;
    editor.focus();
    editor.value = value;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }, content);
}

test.describe("Safe file saves", () => {
  test("exposes the save shortcut and a hidden status region for non-destructive save failures", async ({ page }) => {
    await setupMockBindings(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await openCommandPaletteWithHotkey(page);
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    const search = page.getByLabel("Search commands");
    await search.fill("Save Current File");
    await expect(palette.getByRole("option").filter({ hasText: "Save Current File" })).toBeVisible();
    await page.keyboard.press("Escape");

    const status = page.locator("#save-status");
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toBeHidden();
    await expect(page.getByRole("button", { name: "Retry save" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Reload disk version" })).toBeHidden();
  });

  test("flushes an immediate Markdown edit before opening another document", async ({ page }) => {
    const sourceName = `p004-source-${Date.now()}.md`;
    const targetName = `p004-target-${Date.now()}.md`;
    const sourcePath = fixturePath(sourceName);
    const targetPath = fixturePath(targetName);
    await Promise.all([writeFile(sourcePath, "before", "utf8"), writeFile(targetPath, "target", "utf8")]);

    try {
      await setupMockBindings(page);
      await page.goto("/");
      await openFixture(page, sourceName);
      await editAndOpenInSameRendererTask(page, "saved before switch", targetName);

      await expect.poll(() => readFile(sourcePath, "utf8")).toBe("saved before switch");
      await expect(activeEditor(page)).toHaveValue("target");
      await page.waitForTimeout(autosaveAndWatcherSettleMs);
      await page.reload();
      await expect(page.locator('.workspace-pane-slot[data-active="true"] p').filter({ hasText: /^target$/ })).toBeVisible();
    } finally {
      await Promise.all([unlink(sourcePath).catch(() => undefined), unlink(targetPath).catch(() => undefined)]);
    }
  });

  test("saves Markdown, TXT, and HTML with Cmd or Ctrl+S", async ({ page }) => {
    const suffix = Date.now();
    const markdownName = `p011-${suffix}.md`;
    const textName = `p011-${suffix}.txt`;
    const htmlName = `p011-${suffix}.html`;
    const markdownPath = fixturePath(markdownName);
    const textPath = fixturePath(textName);
    const htmlPath = fixturePath(htmlName);
    await Promise.all([
      writeFile(markdownPath, "markdown before", "utf8"),
      writeFile(textPath, "text before", "utf8"),
      writeFile(htmlPath, "<p>before</p>", "utf8"),
    ]);

    try {
      await setupMockBindings(page);
      await page.goto("/");
      await openFixture(page, markdownName);
      await replaceActiveEditorContent(page, "markdown saved");
      await dispatchGlobalHotkey(page, "s", process.platform === "darwin" ? { metaKey: true } : { ctrlKey: true });
      await expect.poll(() => readFile(markdownPath, "utf8")).toBe("markdown saved");

      await openFixture(page, textName);
      await replaceActiveEditorContent(page, "text saved");
      await dispatchGlobalHotkey(page, "s", process.platform === "darwin" ? { metaKey: true } : { ctrlKey: true });
      await expect.poll(() => readFile(textPath, "utf8")).toBe("text saved");

      await openFixture(page, htmlName);
      await activeHtmlEditor(page).fill("<p>html saved</p>");
      await dispatchGlobalHotkey(page, "s", process.platform === "darwin" ? { metaKey: true } : { ctrlKey: true });
      await expect.poll(() => readFile(htmlPath, "utf8")).toBe("<p>html saved</p>");
    } finally {
      await Promise.all([rm(markdownPath, { force: true }), rm(textPath, { force: true }), rm(htmlPath, { force: true })]);
    }
  });

  test("keeps edits and never recreates a conflicted, deleted, or renamed old path", async ({ page }) => {
    const conflictName = `p007-conflict-${Date.now()}.md`;
    const missingName = `p008-missing-${Date.now()}.md`;
    const renamedName = `p008-renamed-${Date.now()}.md`;
    const conflictPath = fixturePath(conflictName);
    const missingPath = fixturePath(missingName);
    const renamedPath = fixturePath(renamedName);
    await Promise.all([writeFile(conflictPath, "before", "utf8"), writeFile(missingPath, "before", "utf8")]);

    try {
      await setupMockBindings(page);
      await page.goto("/");
      await openFixture(page, conflictName);
      await replaceActiveEditorContent(page, "local conflict edit");
      await writeFile(conflictPath, "external version", "utf8");
      await dispatchGlobalHotkey(page, "s", process.platform === "darwin" ? { metaKey: true } : { ctrlKey: true });
      await expect(activeSaveStatusMessage(page)).toContainText("ディスク上の内容が変更されています");
      await expect(activeEditor(page)).toHaveValue("local conflict edit");
      await expect.poll(() => readFile(conflictPath, "utf8")).toBe("external version");

      await page.getByRole("button", { name: "Reload disk version" }).click();
      await showSourceEditor(page);
      await expect(activeEditor(page)).toHaveValue("external version");
      await openFixture(page, missingName);
      await replaceActiveEditorContent(page, "local missing edit");
      await unlink(missingPath);
      await dispatchGlobalHotkey(page, "s", process.platform === "darwin" ? { metaKey: true } : { ctrlKey: true });
      await expect(activeSaveStatusMessage(page)).toContainText("外部で削除または移動されました");
      await expect(activeEditor(page)).toHaveValue("local missing edit");
      await page.waitForTimeout(autosaveAndWatcherSettleMs);
      await expect(readFile(missingPath, "utf8").then(() => false, () => true)).resolves.toBe(true);

      await writeFile(missingPath, "before rename", "utf8");
      await page.reload();
      await openFixture(page, missingName);
      await replaceActiveEditorContent(page, "local renamed edit");
      await rename(missingPath, renamedPath);
      await dispatchGlobalHotkey(page, "s", process.platform === "darwin" ? { metaKey: true } : { ctrlKey: true });
      await expect(activeSaveStatusMessage(page)).toContainText("外部で削除または移動されました");
      await expect(activeEditor(page)).toHaveValue("local renamed edit");
      await page.waitForTimeout(autosaveAndWatcherSettleMs);
      await expect(readFile(missingPath, "utf8").then(() => false, () => true)).resolves.toBe(true);
      await expect(readFile(renamedPath, "utf8")).resolves.toBe("before rename");
    } finally {
      await Promise.all([rm(conflictPath, { force: true }), rm(missingPath, { force: true }), rm(renamedPath, { force: true })]);
    }
  });
});
