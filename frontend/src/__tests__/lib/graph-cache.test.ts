import { describe, it, expect, beforeEach } from "vitest";
import {
  CachedGraph,
  GraphCacheStorage,
  isCacheValid,
  getCacheAgeMs,
  getCacheAgeText,
  createCacheEntry,
  saveCache,
  loadCache,
  clearCache,
} from "../../lib/graph-cache";

// Mock storage for testing
function createMockStorage(): GraphCacheStorage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: (key: string) => store.get(key) ?? null,
    set: (key: string, value: string) => store.set(key, value),
    remove: (key: string) => store.delete(key),
  };
}

describe("graph-cache", () => {
  describe("isCacheValid", () => {
    it("returns false for null cache", () => {
      expect(isCacheValid(null)).toBe(false);
    });

    it("returns true for any non-null cache (no TTL)", () => {
      const cache: CachedGraph = { data: {}, timestamp: Date.now() - 1000 };
      expect(isCacheValid(cache)).toBe(true);
    });

    it("returns true for very old cache (no TTL)", () => {
      const cache: CachedGraph = { data: {}, timestamp: Date.now() - 365 * 24 * 60 * 60 * 1000 }; // 1 year old
      expect(isCacheValid(cache)).toBe(true);
    });
  });

  describe("getCacheAgeMs", () => {
    it("returns 0 for null cache", () => {
      expect(getCacheAgeMs(null)).toBe(0);
    });

    it("returns correct age for fresh cache", () => {
      const now = Date.now();
      const cache: CachedGraph = { data: {}, timestamp: now - 60000 }; // 1 minute old
      const age = getCacheAgeMs(cache, now);
      expect(age).toBe(60000);
    });

    it("returns correct age for old cache", () => {
      const now = Date.now();
      const cache: CachedGraph = { data: {}, timestamp: now - 2 * 60 * 60 * 1000 }; // 2 hours old
      const age = getCacheAgeMs(cache, now);
      expect(age).toBe(2 * 60 * 60 * 1000);
    });
  });

  describe("getCacheAgeText", () => {
    it("returns 'just now' for null cache", () => {
      expect(getCacheAgeText(null)).toBe("just now");
    });

    it("returns seconds for recent cache", () => {
      const now = Date.now();
      const cache: CachedGraph = { data: {}, timestamp: now - 30000 }; // 30 seconds old
      expect(getCacheAgeText(cache, now)).toBe("30s ago");
    });

    it("returns minutes for cache minutes old", () => {
      const now = Date.now();
      const cache: CachedGraph = { data: {}, timestamp: now - 5 * 60 * 1000 }; // 5 minutes old
      expect(getCacheAgeText(cache, now)).toBe("5m ago");
    });

    it("returns hours for cache hours old", () => {
      const now = Date.now();
      const cache: CachedGraph = { data: {}, timestamp: now - 3 * 60 * 60 * 1000 }; // 3 hours old
      expect(getCacheAgeText(cache, now)).toBe("3h ago");
    });

    it("returns days for cache days old", () => {
      const now = Date.now();
      const cache: CachedGraph = { data: {}, timestamp: now - 2 * 24 * 60 * 60 * 1000 }; // 2 days old
      expect(getCacheAgeText(cache, now)).toBe("2d ago");
    });
  });

  describe("createCacheEntry", () => {
    it("creates cache entry with current timestamp", () => {
      const before = Date.now();
      const entry = createCacheEntry({ nodes: [], edges: [] });
      const after = Date.now();

      expect(entry.data).toEqual({ nodes: [], edges: [] });
      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
    });

    it("creates cache entry with custom timestamp", () => {
      const timestamp = 1234567890;
      const entry = createCacheEntry({ test: true }, timestamp);

      expect(entry.data).toEqual({ test: true });
      expect(entry.timestamp).toBe(timestamp);
    });
  });

  describe("storage operations", () => {
    let storage: ReturnType<typeof createMockStorage>;

    beforeEach(() => {
      storage = createMockStorage();
    });

    describe("saveCache", () => {
      it("saves cache to storage as JSON", () => {
        const cache: CachedGraph = { data: { test: 123 }, timestamp: 1000 };
        saveCache(storage, cache);

        expect(storage.store.size).toBe(1);
        const saved = storage.store.get("obails-graph-cache");
        expect(saved).toBeDefined();
        expect(JSON.parse(saved!)).toEqual(cache);
      });
    });

    describe("loadCache", () => {
      it("returns null when no cache exists", () => {
        expect(loadCache(storage)).toBeNull();
      });

      it("loads and parses cached data", () => {
        const cache: CachedGraph = { data: { nodes: [1, 2, 3] }, timestamp: 5000 };
        storage.set("obails-graph-cache", JSON.stringify(cache));

        const loaded = loadCache(storage);
        expect(loaded).toEqual(cache);
      });

      it("returns null for invalid JSON", () => {
        storage.set("obails-graph-cache", "not valid json{{{");
        expect(loadCache(storage)).toBeNull();
      });
    });

    describe("clearCache", () => {
      it("removes cache from storage", () => {
        const cache: CachedGraph = { data: {}, timestamp: 1000 };
        saveCache(storage, cache);
        expect(storage.store.size).toBe(1);

        clearCache(storage);
        expect(storage.store.size).toBe(0);
      });

      it("does not throw when cache does not exist", () => {
        expect(() => clearCache(storage)).not.toThrow();
      });
    });
  });
});
