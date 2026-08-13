import { describe, expect, it } from "vitest";
import { COMMAND_SCOPE_GLOBAL, type CommandDescriptor } from "../../lib/command-registry";
import {
  WORKSPACE_MANAGE,
  WORKSPACE_MANAGE_HELP,
  WORKSPACE_SAVE_AS,
  WORKSPACE_SAVE_AS_HELP,
  WORKSPACE_SAVE_AS_TITLE,
  WORKSPACE_SAVE_CURRENT,
  isExactWorkspaceName,
  mergeNamedWorkspacePaletteCommands,
  openWorkspaceCommandId,
  openWorkspaceCommandTitle,
  parseNamedWorkspaceCommand,
} from "../../lib/named-workspace-commands";

const split: CommandDescriptor = {
  id: "split-pane-right",
  title: "Split Pane Right",
  category: "Workspace",
  scope: COMMAND_SCOPE_GLOBAL,
  defaultHotkey: "",
  hotkey: "",
};

describe("named workspace commands", () => {
  it("accepts exact names and rejects blank or padded values", () => {
    expect(isExactWorkspaceName("Writing")).toBe(true);
    expect(isExactWorkspaceName("")).toBe(false);
    expect(isExactWorkspaceName(" Writing")).toBe(false);
    expect(isExactWorkspaceName("Writing ")).toBe(false);
  });

  it("parses shared menu and palette identifiers into one action", () => {
    expect(parseNamedWorkspaceCommand(WORKSPACE_SAVE_AS)).toEqual({ type: "save-as" });
    expect(parseNamedWorkspaceCommand(WORKSPACE_SAVE_CURRENT)).toEqual({ type: "save-current" });
    expect(parseNamedWorkspaceCommand(WORKSPACE_MANAGE)).toEqual({ type: "manage" });
    expect(parseNamedWorkspaceCommand(openWorkspaceCommandId("Writing"))).toEqual({ type: "open", name: "Writing" });
    expect(parseNamedWorkspaceCommand("split-pane-right")).toBeNull();
  });

  it("merges Open Workspace palette rows from saved names without duplicating static commands", () => {
    const merged = mergeNamedWorkspacePaletteCommands(
      [
        split,
        { id: WORKSPACE_SAVE_AS, title: WORKSPACE_SAVE_AS_TITLE, category: "Workspace", scope: COMMAND_SCOPE_GLOBAL, defaultHotkey: "", hotkey: "" },
        { id: openWorkspaceCommandId("Stale"), title: openWorkspaceCommandTitle("Stale"), category: "Workspace", scope: COMMAND_SCOPE_GLOBAL, defaultHotkey: "", hotkey: "" },
      ],
      ["Writing", " Research", "Research"],
    );
    expect(merged.map((command) => command.id)).toEqual([
      "split-pane-right",
      WORKSPACE_SAVE_AS,
      openWorkspaceCommandId("Writing"),
      openWorkspaceCommandId("Research"),
    ]);
    expect(merged.at(-1)?.title).toBe("Open Workspace: Research");
  });

  it("states that save-as creates a named snapshot and manage delete keeps the session", () => {
    expect(WORKSPACE_SAVE_AS_HELP).toContain("tabs, splits, layout, and popouts");
    expect(WORKSPACE_SAVE_AS_HELP).toContain("new workspace");
    expect(WORKSPACE_MANAGE_HELP).toContain("Deleting a name does not change the current session");
  });
});
