export type TreeItemAccessibility = {
  level: number;
  label: string;
  expanded?: "true" | "false";
};

export function describeTreeItem(name: string, isDirectory: boolean, level: number, expanded = false): TreeItemAccessibility {
  return {
    level,
    label: `${isDirectory ? "Folder" : "File"}: ${name}`,
    ...(isDirectory ? { expanded: expanded ? "true" : "false" } : {}),
  };
}

export function moveMenuIndex(currentIndex: number, itemCount: number, key: string): number | null {
  if (itemCount === 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowDown") return (currentIndex + 1 + itemCount) % itemCount;
  if (key === "ArrowUp") return (currentIndex - 1 + itemCount) % itemCount;
  return null;
}
