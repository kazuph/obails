import { expect, test } from "@playwright/test";
import { readFile, writeFile, rm } from "node:fs/promises";

test("split pane gives HTML and Markdown the same editor controls", async ({ page }) => {
  const fixture = new URL("./fixtures/test-vault/Split Tone.html", import.meta.url);
  await writeFile(fixture, "<!doctype html><p>Split tone</p>", "utf8");
  try {
    await page.goto('/');
    await page.locator("html[data-app-ready='true']").waitFor();
    const original = page.locator('.workspace-pane-slot[data-active="true"]').first();
    await original.hover();
    await original.getByRole('button', { name: 'Split pane right' }).click();
    const pane = page.locator('.workspace-pane-slot[data-active="true"]').first();
    await expect(pane.locator('.rich-surface:not(.legacy-rich-surface)')).toBeVisible();
    await page.locator('.file-item[data-path="Welcome.md"]').click();
    const toggle = pane.getByRole('button', { name: 'Toggle Source' });
    await pane.hover();
    if (await toggle.getAttribute('aria-pressed') === 'false') await toggle.click();
    const style = (selector: string) => pane.locator(selector).evaluate(el => {
      const s = getComputedStyle(el);
      return [s.fontFamily, s.fontSize, s.padding, s.backgroundColor];
    });
    const editorStyle = await style('.editor-container textarea');
    const previewStyle = await style('.editor-container .preview-content');
    await page.locator('.file-item[data-path="Split Tone.html"]').click();
    const editor = pane.locator('.html-editor-container textarea');
    await expect(editor).toBeVisible();
    expect(await style('.html-editor-container textarea')).toEqual(editorStyle);
    expect(await style('.html-editor-container iframe')).toEqual(previewStyle);
    await expect(pane.locator('.html-editor-container .preview-pane .pane-header')).toBeHidden();
    await pane.hover();
    await toggle.click();
    await expect(editor).toBeHidden();
    await pane.hover();
    await toggle.click();
    await expect(editor).toBeVisible();
    await editor.fill('<!doctype html><p>Local split edit</p>');
    await writeFile(fixture, '<!doctype html><p>External split edit</p>', 'utf8');
    const status = pane.locator('.html-save-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('ディスク上の内容が変更されています');
    await expect(pane.locator('.html-editor-container .editor-pane-header')).toBeVisible();
    await expect(editor).toHaveValue(/Local split edit/);
    expect(await readFile(fixture, 'utf8')).toContain('External split edit');
  } finally {
    await rm(fixture, { force: true });
  }
});

test("HTML and Markdown share editor chrome and source toggle", async ({ page }) => {
  const fixture = new URL("./fixtures/test-vault/Tone Test.html", import.meta.url);
  await writeFile(fixture, "<!doctype html><p>HTML tone test</p>", "utf8");
  try {
    await page.goto("/");
    await page.locator("html[data-app-ready='true']").waitFor();
    const pane = page.locator('.workspace-pane-slot[data-active="true"]').first();
    const toggle = pane.getByRole("button", { name: "Toggle Source" });
    await page.locator('.file-item[data-path="Welcome.md"]').click();
    await pane.hover();
    if (await toggle.getAttribute("aria-pressed") === "false") await toggle.click();
    const markdownEditor = pane.locator('.editor-container textarea');
    const markdownPreview = pane.locator('.editor-container .preview-content');
    await expect(markdownEditor).toBeVisible();
    const styles = (selector: string) => pane.locator(selector).evaluate((el) => {
      const s = getComputedStyle(el);
      return { fontFamily: s.fontFamily, fontSize: s.fontSize, padding: s.padding, backgroundColor: s.backgroundColor };
    });
    const mdEditorStyle = await styles('.editor-container textarea');
    const mdPreviewStyle = await styles('.editor-container .preview-content');
    await expect(pane.locator('.editor-container .pane-header').first()).toHaveCSS('height', '0px');
    await expect(pane.locator('.editor-container .preview-pane .pane-header')).toBeHidden();
    await page.locator('.file-item[data-path="Tone Test.html"]').click();
    const htmlEditor = pane.locator('.html-editor-container textarea');
    const htmlPreview = pane.locator('.html-editor-container iframe');
    await expect(htmlEditor).toBeVisible();
    await expect(htmlPreview).toBeVisible();
    expect(await styles('.html-editor-container textarea')).toEqual(mdEditorStyle);
    expect(await styles('.html-editor-container iframe')).toEqual(mdPreviewStyle);
    await expect(pane.locator('.html-editor-container .pane-header').first()).toHaveCSS('height', '0px');
    await expect(pane.locator('.html-editor-container .preview-pane .pane-header')).toBeHidden();
    await pane.hover();
    await toggle.click();
    await expect(htmlEditor).toBeHidden();
    await expect(htmlPreview).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await pane.hover();
    await toggle.click();
    await expect(htmlEditor).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await htmlEditor.fill('<!doctype html><p>Local change</p>');
    await writeFile(fixture, '<!doctype html><p>External change</p>', 'utf8');
    const status = pane.locator('#html-save-status, .html-save-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('ディスク上の内容が変更されています');
    await expect(pane.locator('.html-editor-container .pane-header').first()).toBeVisible();
    await expect(htmlEditor).toHaveValue(/Local change/);
    expect(await readFile(fixture, 'utf8')).toContain('External change');
  } finally {
    await rm(fixture, { force: true });
  }
});

test("select all stays inside the active note and preserves input selection", async ({ page }, testInfo) => {
  await page.goto("/");
  const selectAll = await page.evaluate(() => navigator.platform.toUpperCase().includes("MAC") ? "Meta+a" : "Control+a");
  await page.locator("html[data-app-ready='true']").waitFor();
  while (await page.locator(".workspace-pane-slot").count() > 1) {
    const count = await page.locator(".workspace-pane-slot").count();
    await page.locator(".workspace-pane-slot").last().locator(".workspace-pane-tab-close").last().click();
    await expect(page.locator(".workspace-pane-slot")).toHaveCount(count - 1);
  }
  await page.locator('.file-item[data-path="Welcome.md"]').click();
  const pane = page.locator('.workspace-pane-slot[data-active="true"]');
  const preview = pane.locator("div.preview-content");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Welcome to Obails");
  await preview.click();
  await page.keyboard.press(selectAll);
  expect(await preview.evaluate((element) => {
    const range = window.getSelection()!.getRangeAt(0);
    return range.startContainer === element && range.startOffset === 0
      && range.endContainer === element && range.endOffset === element.childNodes.length;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("note-selection.png") });
  await pane.getByRole("button", { name: "Split pane right" }).click();
  await expect(page.locator(".workspace-pane-slot")).toHaveCount(2);
  await page.locator('.file-item[data-path="Welcome.md"]').click();
  await expect(pane.locator("div.preview-content")).toContainText("Welcome to Obails");
  const restoredPaneId = await pane.getAttribute("data-pane-id");
  await page.reload();
  await page.locator("html[data-app-ready='true']").waitFor();
  await expect(page.locator(".workspace-pane-slot")).toHaveCount(2);
  await expect(pane).toHaveAttribute("data-pane-id", restoredPaneId!);
  await expect(page.locator("#timeline-submit")).toHaveCount(1);
  await pane.locator("div.preview-content").click();
  await page.keyboard.press(selectAll);
  expect(await pane.locator("div.preview-content").evaluate(element => {
    const range = window.getSelection()!.getRangeAt(0);
    return range.startContainer === element && range.startOffset === 0
      && range.endContainer === element && range.endOffset === element.childNodes.length;
  })).toBe(true);
  const left = page.locator(".workspace-pane-slot").first();
  await left.locator("div.preview-content").click();
  await page.keyboard.press(selectAll);
  await expect(left).toHaveAttribute("data-active", "true");
  await expect.poll(() => left.locator("div.preview-content").evaluate((element) => {
    const selection = window.getSelection();
    if (selection?.rangeCount !== 1) return false;
    const range = selection.getRangeAt(0);
    return range.startContainer === element && range.startOffset === 0
      && range.endContainer === element && range.endOffset === element.childNodes.length;
  })).toBe(true);
  await page.evaluate(() => {
    const panes = document.querySelectorAll(".workspace-pane-slot");
    for (const element of [panes[1], panes[0], panes[1]]) {
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    }
  });
  await expect(page.locator(".workspace-pane-slot").last()).toHaveAttribute("data-active", "true");
  await pane.hover();
  await pane.getByRole("button", { name: "Toggle Source" }).click();
  const editor = pane.locator("textarea[aria-label^='Editor in pane']");
  await editor.focus();
  await page.keyboard.press(selectAll);
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBe((await editor.inputValue()).length);
  await page.locator(".workspace-pane-slot").last().locator(".workspace-pane-tab-close").click();
  await expect(page.locator(".workspace-pane-slot")).toHaveCount(1);
});

test("real backend rejects requests from a different origin or host", async ({ request }) => {
  const foreignOrigin = await request.post("/wails/runtime", {
    headers: { Origin: "https://example.com" },
    data: {},
  });
  expect(foreignOrigin.status()).toBe(403);
  const foreignHost = await request.get("/", { headers: { Host: "example.com" } });
  expect(foreignHost.status()).toBe(403);
  const fixture = new URL("./fixtures/test-vault/Welcome.md", import.meta.url);
  const before = await readFile(fixture, "utf8");
  // Wails Call object and CallBinding method are both 0 in the installed runtime.
  const args = JSON.stringify({ "call-id": "foreign-write", methodID: 1639997475, args: ["Welcome.md", "unexpected write"] });
  const missingOriginGet = await request.get("/wails/runtime", { params: { object: "0", method: "0", args } });
  expect(missingOriginGet.status()).toBe(403);
  const missingOriginPost = await request.post("/wails/runtime", { data: { object: 0, method: 0, args: JSON.parse(args) } });
  expect(missingOriginPost.status()).toBe(403);
  expect(await readFile(fixture, "utf8")).toBe(before);
});


test("untrusted Markdown cannot execute in the app preview", async ({ page }) => {
  const fixture = new URL("./fixtures/test-vault/Security Regression.md", import.meta.url);
  await writeFile(fixture, '<img src="missing-image" onerror="document.documentElement.dataset.compromised=\'yes\'">\n\n<a href="javascript:alert(1)">unsafe link</a>\n\n<iframe src="about:blank"></iframe>\n\n**Safe formatting**', "utf8");
  try {
    await page.goto("/");
    await page.locator("html[data-app-ready='true']").waitFor();
    await page.locator('.file-item[data-path="Security Regression.md"]').click();
    const preview = page.locator('.workspace-pane-slot[data-active="true"] div.preview-content');
    await expect(preview).toContainText("Safe formatting");
    await expect(preview.locator("strong")).toHaveText("Safe formatting");
    await expect(preview.locator("[onerror],script,iframe,object,embed")).toHaveCount(0);
    await expect(preview.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-compromised", "yes");
  } finally {
    await rm(fixture, { force: true });
  }
});
