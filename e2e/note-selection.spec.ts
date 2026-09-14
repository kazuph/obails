import { expect, test } from "@playwright/test";

test("select all stays inside the active note and preserves input selection", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.locator("html[data-app-ready='true']").waitFor();
  await page.locator('.file-item[data-path$=".md"]').first().click();
  const pane = page.locator('.workspace-pane-slot[data-active="true"]');
  const preview = pane.locator(".preview-content");
  await expect(preview).toBeVisible();
  await preview.click();
  await page.keyboard.press("Meta+a");
  expect(await preview.evaluate((element) => {
    const range = window.getSelection()!.getRangeAt(0);
    return range.startContainer === element && range.startOffset === 0
      && range.endContainer === element && range.endOffset === element.childNodes.length;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("note-selection.png") });
  await pane.getByRole("button", { name: "Toggle Source" }).click();
  const editor = pane.locator("textarea[aria-label^='Editor in pane']");
  await editor.focus();
  await page.keyboard.press("Meta+a");
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBe((await editor.inputValue()).length);
});
