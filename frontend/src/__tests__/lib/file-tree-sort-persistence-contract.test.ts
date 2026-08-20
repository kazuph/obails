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
    expect(indexSource).toContain("obails-v1.1.0-explorer-sort-menu");
    expect(indexSource).toContain("obails-v1.1.0-audio-majority-order");
    expect(indexSource).toContain('data-explorer-default-sort="name-descending"');
    expect(indexSource).toContain('id="file-tree-sort-btn"');
    expect(indexSource).toContain('id="file-tree-fold-toggle-btn"');
  });
});
