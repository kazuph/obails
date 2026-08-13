import { readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const fixtureVaultPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/test-vault");
const saveShortcut = process.platform === "darwin" ? "Meta+S" : "Control+S";
const autosaveAndWatcherSettleMs = 500 + 350;

function fixturePath(name: string): string {
  return path.join(fixtureVaultPath, name);
}

async function openFixture(page: Page, name: string) {
  const fileItem = page.locator(`.file-item[data-path="${name}"]`);
  await expect(fileItem).toBeVisible();
  await fileItem.click();
}

async function editAndOpenInSameRendererTask(page: Page, content: string, targetName: string) {
  await page.locator("#editor").evaluate((element, payload) => {
    const editor = element as HTMLTextAreaElement;
    editor.value = payload.content;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    const target = Array.from(document.querySelectorAll<HTMLElement>(".file-item"))
      .find((item) => item.dataset.path === payload.targetName);
    target?.click();
  }, { content, targetName });
}

test.describe("Safe file saves", () => {
  test("exposes the save shortcut and a hidden status region for non-destructive save failures", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("?");
    const shortcuts = page.getByRole("dialog", { name: "⌨️ Keyboard Shortcuts" });
    await expect(shortcuts).toBeVisible();
    await expect(shortcuts.getByText("Save Current File", { exact: true })).toBeVisible();

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
      await page.goto("/");
      await openFixture(page, sourceName);
      await editAndOpenInSameRendererTask(page, "saved before switch", targetName);

      await expect.poll(() => readFile(sourcePath, "utf8")).toBe("saved before switch");
      await expect(page.locator("#editor")).toHaveValue("target");
      await page.waitForTimeout(autosaveAndWatcherSettleMs);
      await page.reload();
      await expect(page.locator("#editor")).toHaveValue("target");
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
      await page.goto("/");
      await openFixture(page, markdownName);
      await page.locator("#editor").fill("markdown saved");
      await page.keyboard.press(saveShortcut);
      await expect.poll(() => readFile(markdownPath, "utf8")).toBe("markdown saved");

      await openFixture(page, textName);
      await page.locator("#editor").fill("text saved");
      await page.keyboard.press(saveShortcut);
      await expect.poll(() => readFile(textPath, "utf8")).toBe("text saved");

      await openFixture(page, htmlName);
      await page.locator("#html-editor").fill("<p>html saved</p>");
      await page.keyboard.press(saveShortcut);
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
      await page.goto("/");
      await openFixture(page, conflictName);
      await page.locator("#editor").fill("local conflict edit");
      await writeFile(conflictPath, "external version", "utf8");
      await page.keyboard.press(saveShortcut);
      await expect(page.locator("#save-status")).toContainText("ディスク上の内容が変更されています");
      await expect(page.locator("#editor")).toHaveValue("local conflict edit");
      await expect.poll(() => readFile(conflictPath, "utf8")).toBe("external version");

      await page.locator("#save-status-reload").click();
      await expect(page.locator("#editor")).toHaveValue("external version");
      await openFixture(page, missingName);
      await page.locator("#editor").fill("local missing edit");
      await unlink(missingPath);
      await page.keyboard.press(saveShortcut);
      await expect(page.locator("#save-status")).toContainText("外部で削除または移動されました");
      await expect(page.locator("#editor")).toHaveValue("local missing edit");
      await page.waitForTimeout(autosaveAndWatcherSettleMs);
      await expect(readFile(missingPath, "utf8").then(() => false, () => true)).resolves.toBe(true);

      await writeFile(missingPath, "before rename", "utf8");
      await page.reload();
      await openFixture(page, missingName);
      await page.locator("#editor").fill("local renamed edit");
      await rename(missingPath, renamedPath);
      await page.keyboard.press(saveShortcut);
      await expect(page.locator("#save-status")).toContainText("外部で削除または移動されました");
      await expect(page.locator("#editor")).toHaveValue("local renamed edit");
      await page.waitForTimeout(autosaveAndWatcherSettleMs);
      await expect(readFile(missingPath, "utf8").then(() => false, () => true)).resolves.toBe(true);
      await expect(readFile(renamedPath, "utf8")).resolves.toBe("before rename");
    } finally {
      await Promise.all([rm(conflictPath, { force: true }), rm(missingPath, { force: true }), rm(renamedPath, { force: true })]);
    }
  });
});
