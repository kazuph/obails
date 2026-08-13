import { expect, test } from "@playwright/test";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureVault = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "test-vault");
const statePath = path.join(fixtureVault, ".obails", "state.json");

test.describe.configure({ mode: "serial" });

test.describe.serial("workspace panes", () => {
  let originalState = "";
  let sourcePath = "";
  let targetPath = "";
  let sourceName = "";
  let targetName = "";

  test.beforeAll(async () => {
    originalState = await readFile(statePath, "utf8");
    const suffix = `${Date.now()}`;
    sourceName = `workspace-left-${suffix}.md`;
    targetName = `workspace-right-${suffix}.md`;
    sourcePath = path.join(fixtureVault, sourceName);
    targetPath = path.join(fixtureVault, targetName);
    await Promise.all([
      writeFile(sourcePath, "# Left pane\n\nleft before", "utf8"),
      writeFile(targetPath, "# Right pane\n\nright before", "utf8"),
    ]);
    await writeFile(statePath, JSON.stringify({
      workspace: {
        paneTree: {
          splitDirection: "horizontal",
          weights: [3, 1],
          children: [
            { paneId: "left" },
            {
              splitDirection: "vertical",
              weights: [1, 2],
              children: [{ paneId: "top" }, { paneId: "bottom" }],
            },
          ],
        },
        activePaneId: "top",
        paneTabs: [
          { paneId: "left", tabs: [{ path: sourceName, fileType: "markdown" }], activeTabPath: sourceName },
          { paneId: "top", tabs: [{ path: targetName, fileType: "markdown" }], activeTabPath: targetName },
          { paneId: "bottom", tabs: [{ path: sourceName, fileType: "markdown" }], activeTabPath: sourceName },
        ],
      },
      explorer: {},
    }), "utf8");
  });

  test.afterAll(async () => {
    await writeFile(statePath, originalState, "utf8");
    await Promise.all([unlink(sourcePath), unlink(targetPath)]);
  });

  test("renders the persisted nested split directions and proportions from the real workspace snapshot", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const panes = page.locator(".rich-surface");
    await expect(panes).toHaveCount(3);
    const split = page.locator('.workspace-host > .workspace-split[data-split-direction="horizontal"]');
    await expect(split).toBeVisible();
    await expect(split).toHaveCSS("flex-direction", "row");
    const left = split.locator(':scope > .workspace-pane-slot[data-pane-id="left"]');
    const nested = split.locator(':scope > .workspace-split[data-split-direction="vertical"]');
    await expect(nested).toHaveCSS("flex-direction", "column");
    const top = nested.locator(':scope > .workspace-pane-slot[data-pane-id="top"]');
    const bottom = nested.locator(':scope > .workspace-pane-slot[data-pane-id="bottom"]');
    const [leftBox, nestedBox, topBox, bottomBox] = await Promise.all([left.boundingBox(), nested.boundingBox(), top.boundingBox(), bottom.boundingBox()]);
    expect(leftBox?.width).toBeGreaterThan(nestedBox?.width ?? 0);
    expect(bottomBox?.height).toBeGreaterThan(topBox?.height ?? 0);
    await expect(page.locator(`.workspace-pane-tab[data-path="${sourceName}"]`)).toBeVisible();
    await expect(page.locator(`.workspace-pane-tab[data-path="${targetName}"]`)).toBeVisible();
    await expect(page.locator('.rich-surface[data-pane-id="top"] textarea').first()).toHaveValue(/right before/);
    await expect(page.locator('.rich-surface[data-pane-id="left"] textarea').first()).toHaveValue(/left before/);
    await expect(page.locator('.rich-surface[data-pane-id="bottom"] textarea').first()).toHaveValue(/left before/);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".rich-surface")).toHaveCount(3);
  });
});

test.describe.serial("workspace startup popout recovery", () => {
  let originalState = "";
  let mainPath = "";
  let childPath = "";
  let mainName = "";
  let childName = "";
  const paneId = "startup-child";
  const popoutId = "startup-popout";

  test.beforeAll(async () => {
    originalState = await readFile(statePath, "utf8");
    const suffix = `${Date.now()}`;
    mainName = `workspace-main-${suffix}.md`;
    childName = `workspace-child-${suffix}.md`;
    mainPath = path.join(fixtureVault, mainName);
    childPath = path.join(fixtureVault, childName);
    await Promise.all([
      writeFile(mainPath, "# Main workspace pane\n\nmain visible", "utf8"),
      writeFile(childPath, "# Restored child pane\n\nchild visible", "utf8"),
    ]);
    await writeFile(statePath, JSON.stringify({
      workspace: {
        paneTree: {
          splitDirection: "horizontal",
          weights: [1, 1],
          children: [{ paneId: "startup-main" }, { paneId }],
        },
        activePaneId: "startup-main",
        paneTabs: [
          { paneId: "startup-main", tabs: [{ path: mainName, fileType: "markdown" }], activeTabPath: mainName },
          { paneId, tabs: [{ path: childName, fileType: "markdown" }], activeTabPath: childName },
        ],
        popoutWindows: [{ id: popoutId, paneId, x: 0, y: 0, width: 640, height: 480 }],
      },
      explorer: {},
    }), "utf8");
  });

  test.afterAll(async () => {
    await writeFile(statePath, originalState, "utf8");
    await Promise.all([unlink(mainPath), unlink(childPath)]);
  });

  test("restores the persisted native child route from the main window and rejoins it by its exact pair", async ({ page, context }) => {
    const childPagePromise = context.waitForEvent("page");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const child = await childPagePromise;
    try {
      await child.waitForLoadState("networkidle");

      await expect(page.locator('.rich-surface[data-pane-id="startup-main"]')).toBeVisible();
      await expect(page.locator(`.rich-surface[data-pane-id="${paneId}"]`)).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute("data-active-pane-id", "startup-main");

      const route = new URL(child.url());
      expect(route.searchParams.get("popout")).toBe(paneId);
      expect(route.searchParams.get("id")).toBe(popoutId);
      await expect(child.locator(".rich-surface")).toHaveCount(1);
      await expect(child.locator(`.rich-surface[data-pane-id="${paneId}"]`)).toBeVisible();
      await expect(child.locator(`.rich-surface[data-pane-id="${paneId}"] textarea`).first()).toHaveValue(/child visible/);
      for (const selector of ["#split-pane-right-btn", "#split-pane-down-btn", "#close-pane-btn", "#popout-pane-btn"]) {
        await expect(child.locator(selector)).toBeHidden();
      }
      await expect(child.locator("#rejoin-popout-btn")).toBeVisible();
      await expect(child.locator("#rejoin-popout-btn")).toContainText("Rejoin");
    } finally {
      if (!child.isClosed()) {
        const childClosed = child.waitForEvent("close");
        await child.locator("#rejoin-popout-btn").click();
        await childClosed;
      }
    }
    await expect(page.locator(`.rich-surface[data-pane-id="${paneId}"]`)).toBeVisible();
    await expect(page.locator(`.workspace-pane-tab[data-path="${childName}"]`)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-active-pane-id", "startup-main");
  });
});
