export const DELETE_MODES = ["system_trash", "vault_trash", "permanent"] as const;

export type DeleteMode = (typeof DELETE_MODES)[number];

export const DEFAULT_DELETE_MODE: DeleteMode = "system_trash";

export function normalizeDeleteMode(mode: string): DeleteMode {
  return DELETE_MODES.includes(mode as DeleteMode)
    ? (mode as DeleteMode)
    : DEFAULT_DELETE_MODE;
}

export function describeDeleteMode(mode: DeleteMode): string {
  switch (mode) {
    case "system_trash":
      return "the system Trash, where it can be restored";
    case "vault_trash":
      return "the vault's .trash folder, where it can be restored";
    case "permanent":
      return "permanent deletion; this cannot be undone";
  }
}
