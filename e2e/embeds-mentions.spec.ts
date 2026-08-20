import { expect, test } from "@playwright/test";
import { setupMockBindings } from "./helpers/mock-bindings";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureVault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/test-vault");
const minimalPdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 1 1]>>endobj
trailer<</Root 1 0 R>>
%%EOF`;

test.describe("generation-bound embeds and unlinked mentions", () => {
  let folder = "";
  let sourcePath = "";
  let targetPath = "";

  test.beforeEach(async ({}, testInfo) => {
    folder = `runtime-embeds-${testInfo.parallelIndex}-${testInfo.retry}`;
    sourcePath = `${folder}/Source.md`;
    targetPath = `${folder}/Target Note.md`;
    await mkdir(path.join(fixtureVault, folder), { recursive: true });
    await writeFile(path.join(fixtureVault, targetPath), "# Overview\n\nHeading section.\n\n## Next\n\nNext section.\n\nBlock content ^target-block\n");
    await writeFile(path.join(fixtureVault, sourcePath), [
      "Target Note is mentioned without a link.",
      "",
      "![[Target Note]]",
      "",
      "![[Target Note#Overview]]",
      "",
      "![[Target Note#^target-block]]",
      "",
      "![[images/test-photo.png|120x80]]",
      "",
      "![[audio/test-tone.wav]]",
      "",
      "![[embed.pdf]]",
    ].join("\n"));
    await writeFile(path.join(fixtureVault, folder, "embed.pdf"), minimalPdf);
  });

  test.afterEach(async () => {
    await rm(path.join(fixtureVault, folder), { recursive: true, force: true });
  });

  test("renders resolved embeds and opens unlinked mentions", async ({ page }) => {
    await setupMockBindings(page);
    await page.goto("/");
    const source = page.locator(`.file-item[data-path="${sourcePath}"]`);
    await expect(source).toBeVisible();
    await source.click();

    await expect(page.locator(".note-embed")).toHaveCount(3);
    await expect(page.locator(".preview-embed-audio")).toHaveCount(1);
    await expect(page.locator(".preview-embed-pdf")).toHaveAttribute("src", /^data:application\/pdf;base64,/);
    await expect(page.locator("img[data-vault-path=\"images/test-photo.png\"]")).toHaveAttribute("alt", "120x80");

    await page.locator(`.file-item[data-path="${targetPath}"]`).click();
    await expect(page.locator(".backlink-section-title").filter({ hasText: "Unlinked mentions" })).toBeVisible();
    const mention = page.locator(".backlink-item.unlinked").filter({ hasText: "Target Note is mentioned" });
    await expect(mention).toBeVisible();
    await mention.press("Enter");
    await expect(page.locator(".note-embed")).toHaveCount(3);
  });
});
