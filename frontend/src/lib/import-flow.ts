export function lastImportedMarkdownPath(
  importedPaths: string[],
  isMarkdownPath: (path: string) => boolean,
): string | null {
  for (let index = importedPaths.length - 1; index >= 0; index -= 1) {
    if (isMarkdownPath(importedPaths[index])) {
      return importedPaths[index];
    }
  }
  return null;
}
