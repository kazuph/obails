export type EditorSettings = { fontFamily: string; fontSize: number; lineNumbers: boolean; wordWrap: boolean };
export function editorSettingsStyle(settings: EditorSettings) {
  return { fontFamily: settings.fontFamily, fontSize: `${settings.fontSize}px`, whiteSpace: settings.wordWrap ? "pre-wrap" : "pre" };
}
