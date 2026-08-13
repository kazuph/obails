import { describe, expect, it } from "vitest";
import { rewritePaneSidebarCachePath, updatePaneSidebarCache } from "../../lib/pane-sidebar-state";

describe("updatePaneSidebarCache", () => {
  it("does not carry pane A link results into a newly opened note B", () => {
    const a = updatePaneSidebarCache(undefined, "A.md", "A");
    const loadedA = { ...a, backlinks: ["A backlink"], mentions: [], outgoing: ["A link"], preparing: false };
    expect(updatePaneSidebarCache(loadedA, "B.md", "B")).toEqual({
      path: "B.md",
      content: "B",
      backlinks: null,
      mentions: null,
      outgoing: null,
      preparing: true,
    });
  });

  it("keeps link results while the same note is edited", () => {
    const current = { path: "A.md", content: "A", backlinks: ["backlink"], mentions: [], outgoing: ["link"], preparing: false };
    expect(updatePaneSidebarCache(current, "A.md", "A edited")).toEqual({ ...current, content: "A edited" });
  });

  it("rewrites only the cache path after rename so prepared link results stay attached", () => {
    const current = { path: "A.md", content: "A", backlinks: ["backlink"], mentions: [], outgoing: ["link"], preparing: false };
    expect(rewritePaneSidebarCachePath(current, "A.md", "B.md", false)).toEqual({ ...current, path: "B.md" });
  });
});
