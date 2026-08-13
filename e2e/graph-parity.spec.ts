import { expect, test } from "@playwright/test";

test.describe("Graph parity", () => {
  test("filters the real graph and exposes selected-node actions", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Graph View" }).click();

    const graphDialog = page.getByRole("dialog", { name: "Knowledge Graph" });
    await expect(graphDialog).toBeVisible();
    await expect(graphDialog.getByLabel("Unresolved links")).not.toBeChecked();
    await expect(graphDialog.getByLabel("Attachments")).not.toBeChecked();
    await expect(graphDialog.getByLabel("Hide orphans")).not.toBeChecked();
    await expect(graphDialog.getByLabel("Include tags")).toBeVisible();
    await expect(graphDialog.getByLabel("Exclude tags")).toBeVisible();
    await expect(graphDialog.getByLabel("Search label, path, or tag")).toBeVisible();
    await expect(graphDialog.getByLabel("Root path")).toBeVisible();
    await expect(graphDialog.getByLabel("Local graph depth").locator("option")).toHaveValues(["0", "1", "2"]);

    await expect(page.getByRole("option", { name: "Graph Root" })).toBeVisible();
    await page.getByRole("option", { name: "Graph Root" }).click();
    await expect(page.locator("#graph-selection-status")).toContainText("Selected: Graph Root");
    await expect(page.locator("#graph-incoming")).toContainText("Graph Child");
    await expect(page.locator("#graph-outgoing")).toContainText("Graph Child");
    await expect(page.getByRole("button", { name: "Open note" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Local graph" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Copy path" })).toBeEnabled();

    await page.getByRole("button", { name: "Local graph" }).click();
    await expect(graphDialog.getByLabel("Root path")).toHaveValue("Graph Root.md");
    await graphDialog.getByLabel("Local graph depth").selectOption("2");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("option", { name: "Graph Root" })).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await graphDialog.getByLabel("Include tags").fill("graph-parity");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("option", { name: "Graph Root" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Graph Child" })).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await graphDialog.getByLabel("Unresolved links").check();
    await graphDialog.getByLabel("Attachments").check();
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("option", { name: "Graph Missing Note" })).toBeVisible();
    await expect(page.getByRole("option", { name: "test-photo.png" })).toBeVisible();
  });

  test("navigates graph nodes with arrows, Space, and Enter", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Graph View" }).click();

    const rootNode = page.getByRole("option", { name: "Graph Root" });
    await rootNode.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#graph-selection-status")).toContainText("Selected: Graph Child");
    await page.keyboard.press("Space");
    await expect(page.locator("#graph-selection-status")).toContainText("Selected: Graph Child");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#graph-selection-status")).toContainText("Selected: Graph Root");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("dialog", { name: "Knowledge Graph" })).toBeHidden();
    await expect(page.getByRole("tab", { name: "Graph Root", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#preview")).toContainText("Graph Root");
  });
});
