import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { setupMockBindings } from "./helpers/mock-bindings";

const vaultPath = path.resolve("e2e/fixtures/test-vault");
const recoveryRoot = path.join(
  os.homedir(),
  ".config",
  "obails",
  "data",
  "file-recovery",
  createHash("sha256").update(vaultPath).digest("hex"),
);
const snapshotsRoot = path.join(recoveryRoot, "snapshots");
const recentlyDeletedRoot = path.join(recoveryRoot, "recently-deleted");

function activeEditor(page: import("@playwright/test").Page) {
  return page.locator('.workspace-pane-slot[data-active="true"] textarea[aria-label^="Editor in pane"]').first();
}

async function prepareRecoveryFixture(): Promise<void> {
  await fs.rm(path.join(vaultPath, ".trash"), { recursive: true, force: true });
  await fs.rm(snapshotsRoot, { recursive: true, force: true });
  await fs.rm(recentlyDeletedRoot, { recursive: true, force: true });
  await fs.mkdir(snapshotsRoot, { recursive: true });
  await fs.mkdir(recentlyDeletedRoot, { recursive: true });
}

test.describe("P-072/P-073 File recovery", () => {
  test.describe.configure({ mode: "serial" });

  test("creates a real snapshot, restores a deleted file, and restores one stored file version", async ({ page }) => {
    await prepareRecoveryFixture();
    const basename = `e2e-recovery-${randomUUID()}.md`;
    const originalContent = "# Recovery fixture\n\nStored before restore.";
    const changedContent = "# Recovery fixture\n\nChanged after snapshot.";
    const filePath = path.join(vaultPath, basename);
    let recentlyDeletedID = "";

    await fs.writeFile(filePath, originalContent, "utf8");
    try {
      await setupMockBindings(page);
      await page.goto("/");
      await page.locator("html[data-app-ready='true']").waitFor();
      const fileItem = page.locator(`.file-item[data-path="${basename}"]`);
      await expect(fileItem).toBeVisible();

      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("button", { name: "Recovery snapshots" }).click();
      const snapshots = page.getByRole("dialog", { name: "Recovery snapshots" });
      const selectSnapshot = snapshots.getByRole("button", { name: "Select" }).first();
      await expect(selectSnapshot).toBeVisible();
      await selectSnapshot.click();
      await snapshots.getByLabel("File path in selected snapshot").fill(basename);
      await snapshots.getByRole("button", { name: "Read file contents" }).click();
      await expect(snapshots.getByLabel("Stored file contents")).toHaveValue(originalContent);

      await snapshots.getByRole("button", { name: "Close recovery snapshots" }).click();
      await page.getByRole("button", { name: "Done" }).click();
      await fileItem.click();
      await page.locator('.workspace-pane-slot[data-active="true"] .rich-surface').first().hover();
      await page.getByRole("button", { name: "Toggle Source" }).click();
      await activeEditor(page).fill(changedContent);
      await page.keyboard.press(process.platform === "darwin" ? "Meta+S" : "Control+S");

      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("button", { name: "Recovery snapshots" }).click();
      await snapshots.getByRole("button", { name: "Select" }).first().click();
      await snapshots.getByLabel("File path in selected snapshot").fill(basename);
      await snapshots.getByRole("button", { name: "Read file contents" }).click();
      await snapshots.getByRole("button", { name: "Restore this file" }).click();
      await expect(snapshots.getByRole("status")).toContainText(`Restored “${basename}”`);
      await page.screenshot({ path: "/tmp/obails-p072-p073-recovery.png", fullPage: true });

      await snapshots.getByRole("button", { name: "Close recovery snapshots" }).click();
      await page.getByRole("button", { name: "Done" }).click();
      await fileItem.click();
      await expect(activeEditor(page)).toHaveValue(originalContent);

      await fileItem.click({ button: "right" });
      await page.locator("#ctx-delete").click();
      const deleteDialog = page.getByRole("dialog", { name: "Delete Item?" });
      await expect(deleteDialog).toContainText("system Trash");
      await deleteDialog.getByRole("button", { name: "Delete" }).click();
      await expect(fileItem).toBeHidden();

      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("button", { name: "Recently deleted" }).click();
      const recentlyDeleted = page.getByRole("dialog", { name: "Recently deleted" });
      const deletedItem = recentlyDeleted.locator(".recovery-list-item", { hasText: basename });
      recentlyDeletedID = await deletedItem.getAttribute("data-recovery-id") || "";
      expect(recentlyDeletedID).not.toBe("");
      await expect(deletedItem.getByRole("button", { name: "Restore" })).toBeVisible();
      await recentlyDeleted.getByRole("button", { name: "Close recently deleted" }).click();
      await page.getByRole("button", { name: "Done" }).click();

      await page.getByRole("button", { name: "New Note" }).click();
      await page.getByLabel("New note filename").fill(basename.slice(0, -3));
      await page.getByRole("button", { name: "Create" }).click();
      await expect(fileItem).toBeVisible();

      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("button", { name: "Recently deleted" }).click();
      const collisionItem = recentlyDeleted.locator(`.recovery-list-item[data-recovery-id="${recentlyDeletedID}"]`);
      await collisionItem.getByRole("button", { name: "Restore" }).click();
      await expect(recentlyDeleted.getByRole("status")).toContainText("Existing vault content was not changed.");
      await recentlyDeleted.getByRole("button", { name: "Close recently deleted" }).click();
      await page.getByRole("button", { name: "Done" }).click();

      await fs.rm(path.join(vaultPath, ".trash", basename), { force: true });

      await fileItem.click({ button: "right" });
      await page.locator("#ctx-delete").click();
      await page.getByRole("dialog", { name: "Delete Item?" }).getByRole("button", { name: "Delete" }).click();
      await expect(fileItem).toBeHidden();

      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("button", { name: "Recently deleted" }).click();
      const originalDeletedItem = recentlyDeleted.locator(`.recovery-list-item[data-recovery-id="${recentlyDeletedID}"]`);
      await originalDeletedItem.getByRole("button", { name: "Restore" }).click();
      await expect(recentlyDeleted.getByRole("status")).toContainText(`Restored “${basename}”`);
      await expect(fileItem).toBeVisible();
    } finally {
      await fs.rm(filePath, { force: true });
      await fs.rm(path.join(vaultPath, ".trash", basename), { force: true });
      if (recentlyDeletedID) {
        await fs.rm(path.join(recentlyDeletedRoot, recentlyDeletedID), { recursive: true, force: true });
      }
      await fs.rm(snapshotsRoot, { recursive: true, force: true });
      await fs.rm(recentlyDeletedRoot, { recursive: true, force: true });
    }
  });
});
