import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(resolve(__dirname, "../../main.ts"), "utf8");
const indexSource = readFileSync(resolve(__dirname, "../../../index.html"), "utf8");

describe("File Explorer sort persistence contract", () => {
  it("hydrates the Explorer from its dedicated persisted configuration", () => {
    expect(mainSource).toContain("ConfigService.GetFileExplorerConfig()");
    expect(mainSource).toContain("resolveFileTreeSort(explorer.SortField, explorer.SortDirection)");
  });

  it("keeps a release marker on the controls embedded in the production bundle", () => {
    expect(indexSource).toContain("obails-v1.0.4-explorer-sort-persistence");
    expect(indexSource).toContain("obails-v1.0.4-audio-majority-order");
    expect(indexSource).toContain('data-explorer-default-sort="name-descending"');
  });
});
