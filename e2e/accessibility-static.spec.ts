import { expect, test } from "@playwright/test";

test.describe("Static accessibility semantics", () => {
  test("keeps every visible toolbar control inside a non-overlapping row", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#app")).toBeVisible();

    const groups = await page.locator(".toolbar-left, .toolbar-center, .toolbar-right").evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
      }),
    );
    expect(groups).toHaveLength(3);
    expect(groups[0].right).toBeLessThanOrEqual(groups[1].left);
    expect(groups[1].right).toBeLessThanOrEqual(groups[2].left);

    const controls = await page.locator(".toolbar button, .toolbar input").evaluateAll((elements) =>
      elements.flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0
          ? [{ left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }]
          : [];
      }),
    );
    for (let first = 0; first < controls.length; first += 1) {
      expect(controls[first].right - controls[first].left).toBeGreaterThan(0);
      for (let second = first + 1; second < controls.length; second += 1) {
        const horizontalOverlap = controls[first].left < controls[second].right && controls[second].left < controls[first].right;
        const verticalOverlap = controls[first].top < controls[second].bottom && controls[second].top < controls[first].bottom;
        expect(horizontalOverlap && verticalOverlap).toBe(false);
      }
    }
  });

  test("exposes named file, input, dialog, button, and menu semantics in the real Wails fixture", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#app")).toBeVisible();

    await expect(page.getByRole("tree", { name: "File tree" })).toBeVisible();
    await expect(page.getByLabel("Search files", { exact: true })).toHaveCount(1);
    await expect(page.getByLabel("New note filename", { exact: true })).toHaveCount(1);
    await expect(page.getByLabel("New timeline entry", { exact: true })).toHaveCount(1);

    const dialogs = [
      ["image-fullscreen-overlay", "image-fs-title", "Image"],
      ["pdf-fullscreen-overlay", "pdf-fs-title", "PDF"],
      ["mermaid-fullscreen", "mermaid-fullscreen-title", "Mermaid Diagram"],
      ["graph-overlay", "graph-title", "Knowledge Graph"],
      ["vault-setup-overlay", "vault-setup-title", "Welcome to Obails"],
      ["delete-confirm-overlay", "delete-confirm-title", "Delete Item?"],
      ["shortcuts-overlay", "shortcuts-title", "⌨️ Keyboard Shortcuts"],
      ["workspace-save-as-overlay", "workspace-save-as-title", "Save Current Workspace As…"],
      ["workspace-manage-overlay", "workspace-manage-title", "Manage Workspaces"],
    ] as const;

    for (const [id, labelId, name] of dialogs) {
      const dialog = page.locator(`#${id}`);
      await expect(dialog).toHaveAttribute("role", "dialog");
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(dialog).toHaveAttribute("aria-labelledby", labelId);
      await expect(page.locator(`#${labelId}`)).toHaveText(name);
    }

    const namedButtons = [
      ["split-pane-right-btn", "Split right"],
      ["split-pane-down-btn", "Split down"],
      ["close-pane-btn", "Close pane"],
      ["popout-pane-btn", "Pop out pane"],
      ["image-fullscreen", "View image fullscreen"],
      ["image-fs-close", "Close fullscreen image"],
      ["pdf-view-mode", "Toggle PDF view mode"],
      ["pdf-prev", "Previous PDF page"],
      ["pdf-next", "Next PDF page"],
      ["pdf-zoom-out", "Zoom out PDF"],
      ["pdf-zoom-in", "Zoom in PDF"],
      ["pdf-fullscreen", "View PDF fullscreen"],
      ["pdf-fs-view-mode", "Toggle fullscreen PDF view mode"],
      ["pdf-fs-prev", "Previous fullscreen PDF page"],
      ["pdf-fs-next", "Next fullscreen PDF page"],
      ["pdf-fs-zoom-out", "Zoom out fullscreen PDF"],
      ["pdf-fs-zoom-in", "Zoom in fullscreen PDF"],
      ["pdf-fs-close", "Close fullscreen PDF"],
      ["mermaid-zoom-out", "Zoom out Mermaid diagram"],
      ["mermaid-zoom-in", "Zoom in Mermaid diagram"],
      ["mermaid-reset", "Reset Mermaid diagram view"],
      ["mermaid-maximize-window", "Maximize Mermaid diagram window"],
      ["mermaid-close", "Close Mermaid diagram"],
      ["graph-relayout", "Re-layout graph"],
      ["graph-close", "Close graph"],
    ] as const;

    for (const [id, name] of namedButtons) {
      const button = page.locator(`#${id}`);
      await expect(button).toHaveAttribute("aria-label", name);
      await expect(button).toHaveAttribute("title", /\S/);
    }

    const workspaceToolbarButtons = [
      ["split-pane-right-btn", "Split right", "Split right"],
      ["split-pane-down-btn", "Split down", "Split down"],
      ["close-pane-btn", "Close pane", "Close pane"],
      ["popout-pane-btn", "Pop out pane", "Pop out active pane into a new window"],
    ] as const;

    for (const [id, ariaLabel, title] of workspaceToolbarButtons) {
      const button = page.locator(`#${id}`);
      await expect(button).toHaveAttribute("aria-label", ariaLabel);
      await expect(button).toHaveAttribute("title", title);
      await expect(button).toHaveText("");
    }

    await expect(page.locator("#workspace-name, #save-workspace-btn, #restore-workspace-btn, #saved-workspace-names")).toHaveCount(0);

    const menu = page.locator("#context-menu");
    await expect(menu).toHaveAttribute("role", "menu");
    await expect(menu).toHaveAttribute("aria-label", "File actions");
    await expect(menu.locator('[role="menuitem"]')).toHaveCount(8);

    for (const [id, name] of [
      ["ctx-new-file", "New File"],
      ["ctx-new-folder", "New Folder"],
      ["ctx-open-finder", "Open Finder"],
      ["ctx-open-file", "Open File"],
      ["ctx-copy-path", "Copy File Path"],
      ["ctx-move", "Move to folder"],
      ["ctx-rename", "Rename"],
      ["ctx-delete", "Delete"],
    ]) {
      const item = page.locator(`#${id}`);
      await expect(item).toHaveAttribute("role", "menuitem");
      await expect(item).toHaveText(name);
      await expect(item).toHaveAttribute("tabindex", "-1");
    }

    await expect(page.locator("#collapse-all-folders-btn svg")).toHaveCount(1);
    await expect(page.locator("#expand-all-folders-btn svg")).toHaveCount(1);
  });

  test("keeps document and sidebars in independent scroll regions with padded previews and left-aligned sorting", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#app")).toBeVisible();

    const layout = await page.evaluate(() => {
      const app = document.getElementById("app")!;
      const preview = document.getElementById("preview")!;
      const fileTree = document.getElementById("file-tree")!;
      const outline = document.getElementById("outline-list")!;
      const sortField = document.getElementById("file-tree-sort-field")!;
      const sortDirection = document.getElementById("file-tree-sort-direction")!;
      const collapse = document.getElementById("collapse-all-folders-btn")!;
      const previewStyle = getComputedStyle(preview);
      return {
        windowScrollY: window.scrollY,
        bodyOverflow: getComputedStyle(document.body).overflow,
        appOverflow: getComputedStyle(app).overflow,
        appHeight: app.getBoundingClientRect().height,
        viewportHeight: window.innerHeight,
        previewPaddingInline: Number.parseFloat(previewStyle.paddingInlineStart),
        previewPaddingBlock: Number.parseFloat(previewStyle.paddingBlockStart),
        previewOverflowY: previewStyle.overflowY,
        fileTreeOverflowY: getComputedStyle(fileTree).overflowY,
        outlineOverflowY: getComputedStyle(outline).overflowY,
        sortFieldLeft: sortField.getBoundingClientRect().left,
        sortFieldTop: sortField.getBoundingClientRect().top,
        sortFieldRight: sortField.getBoundingClientRect().right,
        sortDirectionLeft: sortDirection.getBoundingClientRect().left,
        sortDirectionRight: sortDirection.getBoundingClientRect().right,
        collapseLeft: collapse.getBoundingClientRect().left,
        collapseTop: collapse.getBoundingClientRect().top,
        collapseWidth: collapse.getBoundingClientRect().width,
        expandLeft: document.getElementById("expand-all-folders-btn")!.getBoundingClientRect().left,
        expandTop: document.getElementById("expand-all-folders-btn")!.getBoundingClientRect().top,
      };
    });

    expect(layout.windowScrollY).toBe(0);
    expect(layout.bodyOverflow).toBe("hidden");
    expect(layout.appOverflow).toBe("hidden");
    expect(layout.appHeight).toBe(layout.viewportHeight);
    expect(layout.previewPaddingInline).toBeGreaterThan(0);
    expect(layout.previewPaddingBlock).toBeGreaterThan(0);
    expect(layout.previewOverflowY).toMatch(/auto|scroll/);
    expect(layout.fileTreeOverflowY).toMatch(/auto|scroll/);
    expect(layout.outlineOverflowY).toMatch(/auto|scroll/);
    expect(layout.sortFieldLeft).toBeLessThan(layout.sortDirectionLeft);
    expect(layout.sortFieldRight).toBeLessThanOrEqual(layout.sortDirectionLeft);
    expect(layout.collapseTop).toBeGreaterThan(layout.sortFieldTop);
    expect(layout.collapseLeft).toBeLessThanOrEqual(layout.sortFieldLeft + 1);
    expect(layout.collapseWidth).toBeGreaterThan(0);
    expect(layout.expandTop).toBe(layout.collapseTop);
    expect(layout.expandLeft).toBeGreaterThan(layout.collapseLeft);
  });
});
