import { expect, test } from "@playwright/test";

test.describe("Delete destination settings", () => {
  test("defines every deletion destination and marks permanent deletion as irreversible", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const contract = await page.locator("#settings-overlay").evaluate((dialog) => ({
      role: dialog.getAttribute("role"),
      labelledBy: dialog.getAttribute("aria-labelledby"),
      options: Array.from(dialog.querySelectorAll<HTMLInputElement>('input[name="delete-mode"]')).map((input) => ({
        value: input.value,
        label: input.closest("label")?.textContent?.trim(),
      })),
    }));

    expect(contract).toEqual({
      role: "dialog",
      labelledBy: "settings-title",
      options: [
        { value: "system_trash", label: "Move to the system Trash" },
        { value: "vault_trash", label: "Move to this vault's .trash folder" },
        { value: "permanent", label: "Permanently delete — this cannot be undone" },
      ],
    });
  });
});
