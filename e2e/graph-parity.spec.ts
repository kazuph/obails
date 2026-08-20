import { expect, test, type Page } from "@playwright/test";
import { setupMockBindings, waitForAppCommands } from "./helpers/mock-bindings";

const graphFixture = {
  nodes: [
    { id: "Graph Root.md", path: "Graph Root.md", label: "Graph Root", linkCount: 2, tags: ["graph-parity"] },
    { id: "Graph Child.md", path: "Graph Child.md", label: "Graph Child", linkCount: 1, tags: ["graph-parity"] },
    { id: "Graph Missing Note", label: "Graph Missing Note", linkCount: 1, unresolved: true },
    { id: "images/test-photo.png", label: "test-photo.png", linkCount: 1, attachment: true },
  ],
  edges: [
    { source: "Graph Root.md", target: "Graph Child.md" },
    { source: "Graph Child.md", target: "Graph Root.md" },
    { source: "Graph Root.md", target: "Graph Missing Note" },
    { source: "Graph Root.md", target: "images/test-photo.png" },
  ],
};

test.describe("Graph parity", () => {
  async function openGraphDialog(page: Page) {
    await expect.poll(async () => {
      const graph = page.locator("#graph-overlay");
      const className = await graph.getAttribute("class");
      if (!className?.includes("visible")) {
        await page.locator("#graph-btn").click();
      }
      return await graph.getAttribute("class");
    }, { timeout: 5000 }).toContain("visible");
  }

  test("filters the real graph and exposes selected-node actions", async ({ page }) => {
    await setupMockBindings(page, { graph: graphFixture });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await waitForAppCommands(page);
    await openGraphDialog(page);

    const graphDialog = page.getByRole("dialog", { name: "Knowledge Graph" });
    await expect(graphDialog).toBeVisible();
    await expect(graphDialog.getByLabel("Unresolved links")).not.toBeChecked();
    await expect(graphDialog.getByLabel("Attachments")).not.toBeChecked();
    await expect(graphDialog.getByLabel("Hide orphans")).not.toBeChecked();
    await expect(graphDialog.getByLabel("Include tags")).toBeVisible();
    await expect(graphDialog.getByLabel("Exclude tags")).toBeVisible();
    await expect(graphDialog.getByLabel("Search label, path, or tag")).toBeVisible();
    await expect(graphDialog.getByLabel("Root path")).toBeVisible();
    await expect(graphDialog.getByLabel("Local graph depth").locator("option")).toHaveText(["0", "1", "2"]);

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
    await setupMockBindings(page, { graph: graphFixture });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await waitForAppCommands(page);
    await openGraphDialog(page);

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
    await expect(page.getByRole("button", { name: "Tab Graph Root", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#preview")).toContainText("Graph Root");
  });
});
