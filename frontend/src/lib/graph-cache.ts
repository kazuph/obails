/**
 * Graph data cache management
 * Persistent cache - no TTL, manual refresh only
 */

export interface CachedGraph {
  data: unknown;
  timestamp: number;
}

export interface GraphCacheStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface GraphStructureSignature {
  nodeCount: number;
  edgeCount: number;
  hash: string;
}

export interface GraphLike {
  nodes?: Array<{ id?: unknown }>;
  edges?: Array<{ source?: unknown; target?: unknown }>;
}

const CACHE_KEY = "obails-graph-cache";

/**
 * Check if cache exists (no TTL - always valid if exists)
 */
export function isCacheValid(cachedGraph: CachedGraph | null): boolean {
  return cachedGraph !== null;
}

function endpointId(endpoint: unknown): string {
  if (endpoint && typeof endpoint === "object" && "id" in endpoint) {
    return String((endpoint as { id?: unknown }).id ?? "");
  }
  return String(endpoint ?? "");
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createGraphStructureSignature(graph: GraphLike): GraphStructureSignature {
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];
  const nodeIds = nodes.map((node) => String(node.id ?? "")).sort();
  const edgeIds = edges
    .map((edge) => {
      const source = endpointId(edge.source);
      const target = endpointId(edge.target);
      return source <= target ? `${source}->${target}` : `${target}->${source}`;
    })
    .sort();

  return {
    nodeCount: nodeIds.length,
    edgeCount: edgeIds.length,
    hash: hashString(`${nodeIds.join("\n")}\n---\n${edgeIds.join("\n")}`),
  };
}

export function isSameGraphStructure(
  a: GraphStructureSignature | undefined,
  b: GraphStructureSignature | undefined
): boolean {
  return Boolean(a && b && a.nodeCount === b.nodeCount && a.edgeCount === b.edgeCount && a.hash === b.hash);
}

export function canReuseGraphLayout(
  cachedSignature: GraphStructureSignature | undefined,
  currentGraph: GraphLike
): boolean {
  return isSameGraphStructure(cachedSignature, createGraphStructureSignature(currentGraph));
}

/**
 * Get cache age in milliseconds
 */
export function getCacheAgeMs(cachedGraph: CachedGraph | null, now: number = Date.now()): number {
  if (!cachedGraph) return 0;
  return now - cachedGraph.timestamp;
}

/**
 * Get cache age as human-readable string
 */
export function getCacheAgeText(cachedGraph: CachedGraph | null, now: number = Date.now()): string {
  const ms = getCacheAgeMs(cachedGraph, now);
  if (ms <= 0) return "just now";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return `${seconds}s ago`;
}

/**
 * Create a cache entry
 */
export function createCacheEntry<T>(data: T, timestamp: number = Date.now()): CachedGraph {
  return {
    data,
    timestamp
  };
}

/**
 * Save cache to storage
 */
export function saveCache(storage: GraphCacheStorage, cache: CachedGraph): void {
  storage.set(CACHE_KEY, JSON.stringify(cache));
}

/**
 * Load cache from storage
 */
export function loadCache(storage: GraphCacheStorage): CachedGraph | null {
  const cached = storage.get(CACHE_KEY);
  if (!cached) return null;

  try {
    return JSON.parse(cached) as CachedGraph;
  } catch {
    return null;
  }
}

/**
 * Clear cache from storage
 */
export function clearCache(storage: GraphCacheStorage): void {
  storage.remove(CACHE_KEY);
}
