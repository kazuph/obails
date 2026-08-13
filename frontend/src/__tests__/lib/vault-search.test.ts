import { describe, expect, it } from "vitest";
import { VAULT_SEARCH_OPERATORS, createVaultSearchOptions } from "../../lib/vault-search";

describe("vault-search", () => {
  it("keeps the backend's zero values for all results and complete matching lines", () => {
    expect(createVaultSearchOptions({
      query: "meeting",
      matchCase: false,
      sort: "file-name-ascending",
      contextRunes: "0",
    })).toEqual({
      query: "meeting",
      matchCase: false,
      sort: "file-name-ascending",
      contextRunes: 0,
      limit: 0,
    });
  });

  it("rejects invalid context input before calling the search RPC", () => {
    expect(() => createVaultSearchOptions({
      query: "meeting",
      matchCase: false,
      sort: "file-name-ascending",
      contextRunes: "1.5",
    })).toThrow("Context length must be a non-negative whole number.");
  });

  it("documents every search syntax family from the parity contract", () => {
    expect(VAULT_SEARCH_OPERATORS).toHaveLength(20);
    expect(VAULT_SEARCH_OPERATORS.map(([name]) => name)).toEqual([
      "Plain term", "Exact phrase", "AND", "OR", "Negation", "Grouping", "Regular expression",
      "File scope", "Path scope", "Content scope", "Match case", "Ignore case", "Tag", "Line",
      "Block", "Section", "Task", "Incomplete task", "Completed task", "Property",
    ]);
  });
});
