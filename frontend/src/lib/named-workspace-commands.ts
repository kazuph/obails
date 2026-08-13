import { COMMAND_SCOPE_GLOBAL, type CommandDescriptor } from "./command-registry";

export const WORKSPACE_SAVE_AS = "workspace-save-as";
export const WORKSPACE_SAVE_CURRENT = "workspace-save-current";
export const WORKSPACE_MANAGE = "workspace-manage";
export const WORKSPACE_OPEN_PREFIX = "workspace-open:";

export const WORKSPACE_SAVE_AS_TITLE = "Save Current Workspace As…";
export const WORKSPACE_SAVE_CURRENT_TITLE = "Save Current Workspace";
export const WORKSPACE_MANAGE_TITLE = "Manage Workspaces…";
export const WORKSPACE_CATEGORY = "Workspace";

export const WORKSPACE_SAVE_AS_HELP =
  "Creates a named snapshot of the current tabs, splits, layout, and popouts. This is how you add a new workspace. Ordinary session tabs and splits keep restoring independently.";

export const WORKSPACE_MANAGE_HELP =
  "Named workspaces store tabs, splits, layout, and popouts. Deleting a name does not change the current session tabs, splits, or last layout.";

export type NamedWorkspaceAction =
  | { type: "save-as" }
  | { type: "save-current" }
  | { type: "manage" }
  | { type: "open"; name: string };

export function isExactWorkspaceName(name: string): boolean {
  return name.length > 0 && name === name.trim();
}

export function openWorkspaceCommandId(name: string): string {
  return `${WORKSPACE_OPEN_PREFIX}${name}`;
}

export function openWorkspaceCommandName(id: string): string | null {
  if (!id.startsWith(WORKSPACE_OPEN_PREFIX)) return null;
  const name = id.slice(WORKSPACE_OPEN_PREFIX.length);
  return isExactWorkspaceName(name) ? name : null;
}

export function openWorkspaceCommandTitle(name: string): string {
  return `Open Workspace: ${name}`;
}

export function parseNamedWorkspaceCommand(id: string): NamedWorkspaceAction | null {
  if (id === WORKSPACE_SAVE_AS) return { type: "save-as" };
  if (id === WORKSPACE_SAVE_CURRENT) return { type: "save-current" };
  if (id === WORKSPACE_MANAGE) return { type: "manage" };
  const name = openWorkspaceCommandName(id);
  return name ? { type: "open", name } : null;
}

export function mergeNamedWorkspacePaletteCommands(
  commands: ReadonlyArray<CommandDescriptor>,
  savedNames: ReadonlyArray<string>,
): CommandDescriptor[] {
  const base = commands.filter((command) => !command.id.startsWith(WORKSPACE_OPEN_PREFIX));
  const opens = savedNames.filter(isExactWorkspaceName).map((name) => ({
    id: openWorkspaceCommandId(name),
    title: openWorkspaceCommandTitle(name),
    category: WORKSPACE_CATEGORY,
    scope: COMMAND_SCOPE_GLOBAL,
    defaultHotkey: "",
    hotkey: "",
  }));
  return [...base, ...opens];
}
