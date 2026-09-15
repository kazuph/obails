import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

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
  const preview = pane.locator(".preview-content");
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
  await expect(pane.locator(".preview-content")).toContainText("Welcome to Obails");
  const restoredPaneId = await pane.getAttribute("data-pane-id");
  await page.reload();
  await page.locator("html[data-app-ready='true']").waitFor();
  await expect(page.locator(".workspace-pane-slot")).toHaveCount(2);
  await expect(pane).toHaveAttribute("data-pane-id", restoredPaneId!);
  await expect(page.locator("#timeline-submit")).toHaveCount(1);
  await pane.locator(".preview-content").click();
  await page.keyboard.press(selectAll);
  expect(await pane.locator(".preview-content").evaluate(element => {
    const range = window.getSelection()!.getRangeAt(0);
    return range.startContainer === element && range.startOffset === 0
      && range.endContainer === element && range.endOffset === element.childNodes.length;
  })).toBe(true);
  const left = page.locator(".workspace-pane-slot").first();
  await left.locator(".preview-content").click();
  await page.keyboard.press(selectAll);
  await expect(left).toHaveAttribute("data-active", "true");
  await expect.poll(() => left.locator(".preview-content").evaluate((element) => {
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
