export const GRAPH_DEPTH_OPTIONS = [0, 1, 2] as const;

export type GraphDepth = (typeof GRAPH_DEPTH_OPTIONS)[number];

export interface GraphFilterValues {
  includeUnresolved: boolean;
  includeAttachments: boolean;
  excludeOrphans: boolean;
  tags: string;
  excludeTags: string;
  search: string;
  rootPath: string;
  depth: GraphDepth;
}

export interface GraphNodeLike {
  id: string;
  label: string;
  path?: string;
  type?: string;
}

export interface GraphEdgeLike {
  source: string;
  target: string;
}

export interface GraphLike {
  nodes: GraphNodeLike[];
  edges: GraphEdgeLike[];
}

export interface GraphDirection {
  incoming: GraphNodeLike[];
  outgoing: GraphNodeLike[];
}

export function parseGraphTags(value: string): string[] {
  return Array.from(new Set(value.split(/[\s,]+/).map((tag) => tag.trim()).filter(Boolean)));
}

export function buildGraphOptions(values: GraphFilterValues) {
  return {
    includeUnresolved: values.includeUnresolved,
    includeAttachments: values.includeAttachments,
    excludeOrphans: values.excludeOrphans,
    tags: parseGraphTags(values.tags),
    excludeTags: parseGraphTags(values.excludeTags),
    search: values.search.trim(),
    rootPath: values.rootPath.trim(),
    depth: values.depth,
  };
}

export function hasActiveGraphFilters(values: GraphFilterValues): boolean {
  const options = buildGraphOptions(values);
  return options.includeUnresolved || options.includeAttachments || options.excludeOrphans ||
    options.tags.length > 0 || options.excludeTags.length > 0 || options.search.length > 0 ||
    options.rootPath.length > 0;
}

export function getGraphDirection(graph: GraphLike, nodeID: string): GraphDirection {
  const nodeByID = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming: GraphNodeLike[] = [];
  const outgoing: GraphNodeLike[] = [];

  for (const edge of graph.edges) {
    if (edge.target === nodeID) {
      const source = nodeByID.get(edge.source);
      if (source) incoming.push(source);
    }
    if (edge.source === nodeID) {
      const target = nodeByID.get(edge.target);
      if (target) outgoing.push(target);
    }
  }

  return { incoming, outgoing };
}

export function canOpenGraphNode(node: GraphNodeLike | undefined): boolean {
  return Boolean(node && node.type !== "attachment" && node.type !== "unresolved" && node.path);
}

export function resolveGraphListNavigation(
  currentIndex: number,
  nodeCount: number,
  key: "ArrowUp" | "ArrowDown",
): number | null {
  const nextIndex = key === "ArrowUp" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= nodeCount) {
    return null;
  }
  return nextIndex;
}

export function resolveGraphEdgeNavigation(
  graph: GraphLike,
  nodeID: string,
  key: "ArrowLeft" | "ArrowRight",
): string | null {
  const direction = getGraphDirection(graph, nodeID);
  const adjacent = key === "ArrowLeft" ? direction.incoming[0] : direction.outgoing[0];
  return adjacent?.id ?? null;
}
