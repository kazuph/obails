export type EditorViewState = {
  selectionStart: number;
  selectionEnd: number;
  scrollTop: number;
};

export function clampEditorViewState(
  state: EditorViewState,
  contentLength: number,
  maxScrollTop: number,
): EditorViewState {
  const selectionStart = clamp(state.selectionStart, 0, contentLength);
  return {
    selectionStart,
    selectionEnd: Math.max(selectionStart, clamp(state.selectionEnd, 0, contentLength)),
    scrollTop: clamp(state.scrollTop, 0, maxScrollTop),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
