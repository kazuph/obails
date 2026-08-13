import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const fixtureVaultPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/test-vault");

test.describe("Internal link navigation", () => {
  test("opens Wiki and relative Markdown heading links and creates an unresolved note after confirmation", async ({ page }) => {
    const suffix = Date.now();
    const folderName = `p020-${suffix}`;
    const sourceName = `p020-source-${suffix}.md`;
    const wikiTargetName = `p020-wiki-${suffix}.md`;
    const markdownTargetName = `p024-markdown-${suffix}.md`;
    const missingTargetName = `p027-missing-${suffix}`;
    const folderPath = path.join(fixtureVaultPath, folderName);
    const sourcePath = path.join(fixtureVaultPath, sourceName);

    await mkdir(folderPath, { recursive: false });
    await Promise.all([
      writeFile(path.join(fixtureVaultPath, wikiTargetName), "# Destination\n\nWiki target body", "utf8"),
      writeFile(path.join(folderPath, markdownTargetName), "Destination\n===========\n\nMarkdown target body", "utf8"),
      writeFile(sourcePath, [
        "# Source",
        `[[${wikiTargetName.replace(/\.md$/, "")}#Destination|Wiki heading]]`,
        `[Markdown heading](${folderName}/${markdownTargetName}#Destination)`,
        `[[${missingTargetName}|Missing note]]`,
      ].join("\n"), "utf8"),
    ]);

    try {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.locator(`.file-item[data-path="${sourceName}"]`).click();

      await page.locator(`.wiki-link[data-link*="${wikiTargetName.replace(/\.md$/, "")}"]`).click();
      await expect(page.locator("#editor")).toHaveValue(/Wiki target body/);

      await page.locator(`.file-item[data-path="${sourceName}"]`).click();
      await page.getByRole("link", { name: "Markdown heading" }).click();
      await expect(page.locator("#editor")).toHaveValue(/Markdown target body/);

      await page.locator(`.file-item[data-path="${sourceName}"]`).click();
      await page.getByRole("link", { name: "Missing note" }).click();
      const dialog = page.getByRole("dialog", { name: "Create linked note?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Create note" }).click();
      await expect(page.locator("#editor-title")).toHaveText(missingTargetName);
    } finally {
      await Promise.all([
        rm(sourcePath, { force: true }),
        rm(path.join(fixtureVaultPath, wikiTargetName), { force: true }),
        rm(path.join(fixtureVaultPath, `${missingTargetName}.md`), { force: true }),
        rm(folderPath, { recursive: true, force: true }),
      ]);
    }
  });
});
