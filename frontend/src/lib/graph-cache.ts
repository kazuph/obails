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

const CACHE_KEY = "obails-graph-cache";

/**
 * Check if cache exists (no TTL - always valid if exists)
 */
export function isCacheValid(cachedGraph: CachedGraph | null): boolean {
  return cachedGraph !== null;
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
