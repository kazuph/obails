export type CommandDescriptor = { id: string; title: string; category: string; scope: string; defaultHotkey: string; hotkey: string };

export const COMMAND_SCOPE_GLOBAL = "global";
export const COMMAND_SCOPE_NOTE = "note";

export function formatHotkeyForPlatform(hotkey: string, isMac: boolean): string {
  return hotkey.replaceAll("Cmd", isMac ? "⌘" : "Ctrl");
}

export function filterCommands(commands: CommandDescriptor[], query: string): CommandDescriptor[] {
  const needle = query.trim().toLocaleLowerCase();
  return needle ? commands.filter((command) => `${command.title} ${command.category} ${command.hotkey}`.toLocaleLowerCase().includes(needle)) : commands;
}

export function matchesHotkey(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, hotkey: string, isMac: boolean): boolean {
  const parts = hotkey.split("+");
  const key = parts.pop()?.toLocaleLowerCase();
  if (!key) return false;
  const command = parts.includes("Cmd");
  const explicitShift = parts.includes("Shift");
  const expectedMeta = command && isMac;
  const expectedCtrl = parts.includes("Ctrl") || (command && !isMac);
  const expectedAlt = parts.includes("Alt");
  const literalShift = !explicitShift && key.length === 1 && !/[a-z0-9]/i.test(key);
  return event.key.toLocaleLowerCase() === key && event.metaKey === expectedMeta && event.ctrlKey === expectedCtrl && event.altKey === expectedAlt && (literalShift || event.shiftKey === explicitShift);
}

export function isNoteSearchContext(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return element.closest([
    "#editor",
    "#html-editor",
    "#preview",
    "#note-search",
    ".editor-pane",
    ".preview-pane",
    ".html-editor-container",
    ".rich-surface .editor-container",
    "[data-note-search-context='true']",
  ].join(", ")) !== null;
}

/**
 * Cmd/Ctrl+F is shared: note-scoped Find in Note wins inside a note surface;
 * otherwise global Search Vault opens. Same chord is allowed across scopes.
 */
export function resolveHotkeyCommand(
  commands: ReadonlyArray<CommandDescriptor>,
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  isMac: boolean,
  noteContext: boolean,
): CommandDescriptor | undefined {
  const matches = commands.filter((descriptor) => descriptor.hotkey && matchesHotkey(event, descriptor.hotkey, isMac));
  if (matches.length === 0) return undefined;
  if (noteContext) {
    return matches.find((descriptor) => descriptor.scope === COMMAND_SCOPE_NOTE)
      || matches.find((descriptor) => descriptor.scope === COMMAND_SCOPE_GLOBAL)
      || matches[0];
  }
  return matches.find((descriptor) => descriptor.scope === COMMAND_SCOPE_GLOBAL)
    || matches.find((descriptor) => descriptor.scope !== COMMAND_SCOPE_NOTE)
    || matches[0];
}

export function suppressPrintableHotkeyInEditableTarget(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">,
  target: EventTarget | null,
): boolean {
  const element = target instanceof Element ? target : null;
  const editable = element?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
  return editable && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}
