import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setupMockBindings } from "./helpers/mock-bindings";

const artifactDir = process.env.OBAILS_REVIEW_FIX_ARTIFACT_DIR;

async function applyRosePineDawn(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "rosepine-dawn");
    window.localStorage.setItem("obails-theme", "rosepine-dawn");
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rosepine-dawn");
}

test("rosepine-dawn keeps both sidebar boundaries gapless and shows recursive folder counts", async ({ page }) => {
  await setupMockBindings(page, {
    initialLastOpenedFile: { path: "Welcome.md", fileType: "markdown" },
    fileInfos: [
      {
        name: "projects",
        path: "projects",
        isDir: true,
        children: [
          { name: "one.md", path: "projects/one.md", isDir: false, fileType: "markdown" },
          {
            name: "nested",
            path: "projects/nested",
            isDir: true,
            children: [
              { name: "two.md", path: "projects/nested/two.md", isDir: false, fileType: "markdown" },
              { name: "image.png", path: "projects/nested/image.png", isDir: false, fileType: "image" },
            ],
          },
        ],
      },
      { name: "Welcome.md", path: "Welcome.md", isDir: false, fileType: "markdown" },
    ],
  });
  await page.goto("/");
  await page.locator("html[data-app-ready='true']").waitFor();
  await applyRosePineDawn(page);

  await expect(page.locator('.file-item.folder[data-path="projects"] .folder-note-count')).toHaveText("2");
  await expect(page.locator('.file-item.folder[data-path="projects"]')).toHaveAttribute("aria-expanded", "false");

  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
    const style = (selector: string) => getComputedStyle(document.querySelector<HTMLElement>(selector)!);
    const sidebar = rect("#sidebar");
    const main = rect(".main-content");
    const right = rect("#right-sidebar");
    const sidebarHandle = rect("#sidebar-resize");
    const rightHandle = rect("#right-sidebar-resize");
    const horizontalHandle = rect("#outline-resize");
    const activePane = rect('.workspace-pane-slot[data-active="true"]');
    const activeTabs = rect('.workspace-pane-slot[data-active="true"] > .workspace-pane-tabs');
    const firstTab = rect('.workspace-pane-tab[data-path="Welcome.md"]');
    const firstTabStyle = style('.workspace-pane-tab[data-path="Welcome.md"]');
    const previewContent = rect('.workspace-pane-slot[data-active="true"] .preview-content');
    const sidebarHandleStyle = style("#sidebar-resize");
    const horizontalHandleStyle = style("#outline-resize");
    return {
      leftBoundary: sidebar.right,
      rightBoundary: right.left,
      leftGap: main.left - sidebar.right,
      rightGap: right.left - main.right,
      sidebarHandleWidth: sidebarHandle.width,
      sidebarHandleLayoutWidth: sidebarHandle.width
        + Number.parseFloat(sidebarHandleStyle.marginLeft)
        + Number.parseFloat(sidebarHandleStyle.marginRight),
      rightHandleCenterDelta: rightHandle.left + rightHandle.width / 2 - right.left,
      horizontalHandleHeight: horizontalHandle.height,
      horizontalHandleLayoutHeight: horizontalHandle.height
        + Number.parseFloat(horizontalHandleStyle.marginTop)
        + Number.parseFloat(horizontalHandleStyle.marginBottom),
      tabPaneLeftDelta: firstTab.left - activePane.left,
      tabBottomGap: activeTabs.bottom - firstTab.bottom,
      tabBottomLeftRadius: firstTabStyle.borderBottomLeftRadius,
      tabBottomRightRadius: firstTabStyle.borderBottomRightRadius,
      tabBottomBorderWidth: firstTabStyle.borderBottomWidth,
      activeTabBorderColor: firstTabStyle.borderLeftColor,
      activeContentTopRuleColor: getComputedStyle(
        document.querySelector<HTMLElement>('.workspace-pane-slot[data-active="true"] > .workspace-pane-tabs')!,
      ).borderBottomColor,
      tabContentGap: previewContent.top - activeTabs.bottom,
    };
  });

  expect(geometry.leftGap).toBe(0);
  expect(geometry.rightGap).toBe(0);
  expect(geometry.sidebarHandleWidth).toBe(8);
  expect(geometry.sidebarHandleLayoutWidth).toBe(0);
  expect(geometry.rightHandleCenterDelta).toBe(0);
  expect(geometry.horizontalHandleHeight).toBe(8);
  expect(geometry.horizontalHandleLayoutHeight).toBe(0);
  expect(geometry.tabPaneLeftDelta).toBe(2);
  expect(geometry.tabBottomGap).toBe(1);
  expect(geometry.tabBottomLeftRadius).toBe("0px");
  expect(geometry.tabBottomRightRadius).toBe("0px");
  expect(geometry.tabBottomBorderWidth).toBe("0px");
  expect(geometry.activeContentTopRuleColor).toBe(geometry.activeTabBorderColor);
  expect(Math.abs(geometry.tabContentGap)).toBeLessThanOrEqual(0.5);

  const paneActions = page.locator('.workspace-pane-slot[data-active="true"] > .rich-surface > .workspace-pane-actions');
  await expect(paneActions).toHaveCSS("opacity", "0");
  await page.locator('.workspace-pane-slot[data-active="true"] > .rich-surface').hover();
  await expect(paneActions).toHaveCSS("opacity", "1");
  await page.locator('[data-pane-action="split-right"]').click();
  const splitHandle = page.locator('.workspace-split-resize.vertical');
  await expect(splitHandle).toBeVisible();
  const splitBoundary = await splitHandle.evaluate((element) => {
    const handle = element.getBoundingClientRect();
    const line = getComputedStyle(element, "::before");
    return {
      handleWidth: handle.width,
      layoutWidth: handle.width
        + Number.parseFloat(getComputedStyle(element).marginLeft)
        + Number.parseFloat(getComputedStyle(element).marginRight),
      lineWidth: Number.parseFloat(line.width),
      lineColor: line.backgroundColor,
    };
  });
  expect(splitBoundary.handleWidth).toBe(8);
  expect(splitBoundary.layoutWidth).toBe(0);
  expect(splitBoundary.lineWidth).toBe(1);
  expect(splitBoundary.lineColor).not.toBe("rgba(0, 0, 0, 0)");

  if (artifactDir) {
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, "rosepine-dawn-review-fixes.png"), fullPage: true });
    const app = await page.locator("#app").boundingBox();
    if (app) {
      await page.screenshot({
        path: path.join(artifactDir, "left-boundary-zoom.png"),
        clip: { x: Math.max(0, geometry.leftBoundary - 16), y: 0, width: 32, height: Math.min(720, app.height) },
      });
      await page.screenshot({
        path: path.join(artifactDir, "right-boundary-zoom.png"),
        clip: { x: Math.max(0, geometry.rightBoundary - 16), y: 0, width: 32, height: Math.min(720, app.height) },
      });
    }
    await writeFile(
      path.join(artifactDir, "geometry.json"),
      `${JSON.stringify({ ...geometry, splitBoundary }, null, 2)}\n`,
      "utf8",
    );
  }
});

test("Cmd+W closes active notes one at a time and leaves the main pane open when empty", async ({ page }) => {
  await setupMockBindings(page, {
    initialLastOpenedFile: { path: "Mermaid Demo.md", fileType: "markdown" },
    workspace: {
      paneTree: { paneId: "main" },
      activePaneId: "main",
      paneTabs: [{
        paneId: "main",
        tabs: [
          { path: "Welcome.md", fileType: "markdown" },
          { path: "Mermaid Demo.md", fileType: "markdown" },
        ],
        activeTabPath: "Mermaid Demo.md",
      }],
      popoutWindows: [],
      savedWorkspaces: [],
      activeNamedWorkspace: "",
    },
  });
  await page.goto("/");
  await page.locator("html[data-app-ready='true']").waitFor();

  await page.keyboard.press("Meta+w");
  await expect(page.locator('.workspace-pane-tab[data-path="Mermaid Demo.md"]')).toHaveCount(0);
  await expect(page.locator('.workspace-pane-tab[data-path="Welcome.md"]')).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Meta+w");
  await expect(page.locator(".workspace-pane-tab[data-path]")).toHaveCount(0);
  await expect(page.locator('.workspace-pane-slot[data-pane-id="main"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Empty pane" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Document pane main" })).toContainText("Select a note from the file tree.");
});
