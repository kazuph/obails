import type { WorkspacePaneTreeSnapshot } from "./workspace-snapshot";

export type WorkspaceLayoutNode = {
  paneId?: string;
  direction?: "horizontal" | "vertical";
  weight: number;
  children: ReadonlyArray<WorkspaceLayoutNode>;
};

const DEFAULT_SPLIT_WEIGHT = 1;

/** Converts the persisted pane tree into the DOM layout contract. */
export function workspaceLayoutTree(tree: WorkspacePaneTreeSnapshot): WorkspaceLayoutNode {
  if (tree.paneId) return { paneId: tree.paneId, weight: DEFAULT_SPLIT_WEIGHT, children: [] };
  const weights = tree.weights?.length === tree.children?.length
    ? tree.weights
    : tree.children?.map(() => DEFAULT_SPLIT_WEIGHT) ?? [];
  return {
    direction: tree.splitDirection,
    weight: DEFAULT_SPLIT_WEIGHT,
    children: (tree.children ?? []).map((child, index) => ({
      ...workspaceLayoutTree(child),
      weight: weights[index],
    })),
  };
}

/** Removes panes hosted by native popouts while preserving the remaining tree. */
export function withoutWorkspacePanes(node: WorkspaceLayoutNode, hiddenPaneIds: ReadonlySet<string>): WorkspaceLayoutNode | null {
  if (node.paneId) return hiddenPaneIds.has(node.paneId) ? null : node;
  const children = node.children
    .map((child) => withoutWorkspacePanes(child, hiddenPaneIds))
    .filter((child): child is WorkspaceLayoutNode => child !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return { ...children[0], weight: node.weight };
  return { ...node, children };
}

export function splitWeightsFromPointer(
  root: WorkspaceLayoutNode,
  path: ReadonlyArray<number>,
  boundaryIndex: number,
  pointerOffset: number,
  parentSize: number,
): number[] | null {
  let node = root;
  for (const childIndex of path) {
    const child = node.children[childIndex];
    if (!child) return null;
    node = child;
  }
  if (boundaryIndex < 0 || boundaryIndex + 1 >= node.children.length || !Number.isFinite(pointerOffset) || !Number.isFinite(parentSize) || parentSize <= 0) return null;
  const weights = node.children.map((child) => child.weight);
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) return null;
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const prefix = weights.slice(0, boundaryIndex).reduce((sum, weight) => sum + weight, 0);
  const pairTotal = weights[boundaryIndex] + weights[boundaryIndex + 1];
  const beforeWeight = total * (pointerOffset / parentSize) - prefix;
  const afterWeight = pairTotal - beforeWeight;
  if (!Number.isFinite(beforeWeight) || !Number.isFinite(afterWeight) || beforeWeight <= 0 || afterWeight <= 0) return null;
  return weights.map((weight, index) => index === boundaryIndex
    ? beforeWeight
    : index === boundaryIndex + 1
      ? afterWeight
      : weight);
}
