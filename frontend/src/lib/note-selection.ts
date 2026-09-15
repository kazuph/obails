export function selectNoteText(event: KeyboardEvent, preview: HTMLElement): boolean {
  if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "a") return false;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"]'))) return false;
  const selection = preview.ownerDocument.getSelection();
  if (!selection) return false;
  event.preventDefault();
  selectNoteContents(preview);
  return true;
}

export function selectNoteContents(preview: HTMLElement): void {
  const selection = preview.ownerDocument.getSelection();
  if (!selection) return;
  const range = preview.ownerDocument.createRange();
  range.selectNodeContents(preview);
  selection.removeAllRanges();
  selection.addRange(range);
}
