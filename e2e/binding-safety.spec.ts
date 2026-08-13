import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("renderer bindings exclude internal deletion and vault override primitives", async () => {
  const [fileService, configService] = await Promise.all([
    readFile(path.join(repoRoot, "frontend/bindings/github.com/kazuph/obails/services/fileservice.js"), "utf8"),
    readFile(path.join(repoRoot, "frontend/bindings/github.com/kazuph/obails/services/configservice.js"), "utf8"),
  ]);

  for (const forbidden of ["DeleteFile", "DeletePath", "MoveToVaultTrash", "TrashPath"]) {
    expect(fileService).not.toContain(`export function ${forbidden}(`);
  }
  for (const forbidden of ["OverrideVaultPath", "SetVaultPath"]) {
    expect(configService).not.toContain(`export function ${forbidden}(`);
  }
});
