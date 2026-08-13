import { describe, expect, it } from "vitest";
import {
  COMMAND_SCOPE_GLOBAL,
  COMMAND_SCOPE_NOTE,
  formatHotkeyForPlatform,
  isNoteSearchContext,
  matchesHotkey,
  resolveHotkeyCommand,
  suppressPrintableHotkeyInEditableTarget,
  type CommandDescriptor,
} from "../../lib/command-registry";
const event = (overrides: Partial<KeyboardEvent>) => ({ key: "p", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...overrides }) as KeyboardEvent;
const cmdFCommands: CommandDescriptor[] = [
  { id: "find-in-note", title: "Find in Note", category: "Search", scope: COMMAND_SCOPE_NOTE, defaultHotkey: "Cmd+F", hotkey: "Cmd+F" },
  { id: "search-vault", title: "Search Vault", category: "Search", scope: COMMAND_SCOPE_GLOBAL, defaultHotkey: "Cmd+F", hotkey: "Cmd+F" },
];
describe("matchesHotkey", () => {
  it("uses primary modifier on each platform and rejects extras", () => {
    expect(matchesHotkey(event({ metaKey: true }), "Cmd+P", true)).toBe(true);
    expect(matchesHotkey(event({ metaKey: true, ctrlKey: true }), "Cmd+P", true)).toBe(false);
    expect(matchesHotkey(event({ ctrlKey: true }), "Cmd+P", false)).toBe(true);
    expect(matchesHotkey(event({ ctrlKey: true, metaKey: true }), "Cmd+P", false)).toBe(false);
    expect(matchesHotkey(event({ ctrlKey: true, altKey: true }), "Cmd+P", false)).toBe(false);
  });
  it("accepts shifted literal question mark without a duplicate Shift token", () => {
    expect(matchesHotkey(event({ key: "?", shiftKey: true }), "?", true)).toBe(true);
    expect(matchesHotkey(event({ key: "?", shiftKey: true, altKey: true }), "?", true)).toBe(false);
  });
});

describe("suppressPrintableHotkeyInEditableTarget", () => {
  it("preserves typing for unmodified and Shift-only printable keys", () => {
    const input = document.createElement("input");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "");
    expect(suppressPrintableHotkeyInEditableTarget(event({ key: "a" }), input)).toBe(true);
    expect(suppressPrintableHotkeyInEditableTarget(event({ key: "A", shiftKey: true }), input)).toBe(true);
    expect(suppressPrintableHotkeyInEditableTarget(event({ key: "?", shiftKey: true }), select)).toBe(true);
    expect(suppressPrintableHotkeyInEditableTarget(event({ key: "a" }), editable)).toBe(true);
  });

  it("allows modifier chords, non-printable keys, and non-editable targets", () => {
    const textarea = document.createElement("textarea");
    expect(suppressPrintableHotkeyInEditableTarget(event({ key: "p", metaKey: true }), textarea)).toBe(false);
    expect(suppressPrintableHotkeyInEditableTarget(event({ key: "Escape" }), textarea)).toBe(false);
    expect(suppressPrintableHotkeyInEditableTarget(event({ key: "a" }), document.createElement("div"))).toBe(false);
  });
});

describe("formatHotkeyForPlatform", () => {
  it("renders the primary modifier for the active platform", () => {
    expect(formatHotkeyForPlatform("Cmd+Shift+P", true)).toBe("⌘+Shift+P");
    expect(formatHotkeyForPlatform("Cmd+Shift+P", false)).toBe("Ctrl+Shift+P");
  });
});

describe("resolveHotkeyCommand", () => {
  const cmdFEvent = event({ key: "f", metaKey: true });

  it("prefers Find in Note inside a note surface when both share Cmd+F", () => {
    const editor = document.createElement("div");
    editor.id = "editor";
    document.body.append(editor);
    expect(isNoteSearchContext(editor)).toBe(true);
    expect(resolveHotkeyCommand(cmdFCommands, cmdFEvent, true, true)?.id).toBe("find-in-note");
    editor.remove();
  });

  it("prefers Search Vault outside a note surface when both share Cmd+F", () => {
    const sidebar = document.createElement("aside");
    document.body.append(sidebar);
    expect(isNoteSearchContext(sidebar)).toBe(false);
    expect(resolveHotkeyCommand(cmdFCommands, cmdFEvent, true, false)?.id).toBe("search-vault");
    sidebar.remove();
  });
});
