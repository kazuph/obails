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
    const selection = window.getSelection()!;
    return { text: selection.toString(), expected: element.textContent, contained: element.contains(selection.getRangeAt(0).commonAncestorContainer) };
  })).toEqual(expect.objectContaining({ contained: true }));
  const selected = await preview.evaluate((element) => ({ actual: window.getSelection()?.toString(), expected: element.textContent }));
  expect(selected.actual).toBe(selected.expected);
  await page.screenshot({ path: testInfo.outputPath("note-selection.png") });
  await pane.getByRole("button", { name: "Toggle Source" }).click();
  const editor = pane.locator("textarea[aria-label^='Editor in pane']");
  await editor.focus();
  await page.keyboard.press("Meta+a");
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBe((await editor.inputValue()).length);
});
