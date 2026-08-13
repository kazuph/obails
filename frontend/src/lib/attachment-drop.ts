export type AttachmentEmbedInsertion = {
  content: string;
  selectionStart: number;
  selectionEnd: number;
};

export function insertAttachmentEmbeds(
  content: string,
  selectionStart: number,
  selectionEnd: number,
  embeds: readonly string[],
): AttachmentEmbedInsertion {
  if (embeds.length === 0 || embeds.some((embed) => !embed.trim())) {
    throw new Error("attachment embeds must be non-empty");
  }
  const start = Math.max(0, Math.min(selectionStart, content.length));
  const end = Math.max(start, Math.min(selectionEnd, content.length));
  const before = content.slice(0, start);
  const after = content.slice(end);
  const inserted = embeds.join("\n");
  const prefix = before && !before.endsWith("\n") ? "\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n" : "";
  const insertionStart = before.length + prefix.length;
  const nextContent = before + prefix + inserted + suffix + after;
  const cursor = insertionStart + inserted.length;
  return { content: nextContent, selectionStart: cursor, selectionEnd: cursor };
}
