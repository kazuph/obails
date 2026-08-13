export type VaultSearchSort =
  | "file-name-ascending"
  | "file-name-descending"
  | "modified-newest"
  | "modified-oldest";

export type VaultSearchOptions = {
  query: string;
  matchCase: boolean;
  sort: VaultSearchSort;
  contextRunes: number;
  limit: number;
};

export const VAULT_SEARCH_OPERATORS = [
  ["Plain term", "meeting"],
  ["Exact phrase", '"project plan"'],
  ["AND", "project plan"],
  ["OR", "project OR plan"],
  ["Negation", "-draft"],
  ["Grouping", "(project OR plan) -draft"],
  ["Regular expression", "/^# /"],
  ["File scope", "file:project"],
  ["Path scope", "path:notes/"],
  ["Content scope", "content:meeting"],
  ["Match case", "match-case:MiXeD"],
  ["Ignore case", "ignore-case:mixed"],
  ["Tag", "tag:#work"],
  ["Line", "line:(alpha beta)"],
  ["Block", "block:(alpha beta)"],
  ["Section", "section:(alpha beta)"],
  ["Task", "task:call"],
  ["Incomplete task", "task-todo:call"],
  ["Completed task", "task-done:archive"],
  ["Property", "[status:Draft], [aliases], [empty:null]"],
] as const;

export function createVaultSearchOptions(input: {
  query: string;
  matchCase: boolean;
  sort: VaultSearchSort;
  contextRunes: string;
}): VaultSearchOptions {
  const contextRunes = Number(input.contextRunes);
  if (!Number.isInteger(contextRunes) || contextRunes < 0) {
    throw new Error("Context length must be a non-negative whole number.");
  }

  return {
    query: input.query,
    matchCase: input.matchCase,
    sort: input.sort,
    contextRunes,
    limit: 0,
  };
}
