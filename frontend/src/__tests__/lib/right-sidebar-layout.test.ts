import { describe, expect, it } from "vitest";
import {
  defaultRightSidebarLayout,
  normalizeRightSidebarLayout,
  toggleRightSidebarSection,
} from "../../lib/right-sidebar-layout";

describe("right sidebar layout", () => {
  it("defaults to all sections expanded with equal sizes", () => {
    expect(defaultRightSidebarLayout()).toEqual({
      collapsed: {
        outline: false,
        outgoing: false,
        backlinks: false,
      },
      sizes: {
        outline: 1,
        outgoing: 1,
        backlinks: 1,
      },
    });
  });

  it("normalizes partial persisted state", () => {
    expect(
      normalizeRightSidebarLayout({
        collapsed: { outgoing: true },
        sizes: { outline: 640, outgoing: -1, backlinks: 120 },
      }),
    ).toEqual({
      collapsed: {
        outline: false,
        outgoing: true,
        backlinks: false,
      },
      sizes: {
        outline: 640,
        outgoing: 1,
        backlinks: 120,
      },
    });
  });

  it("toggles one section without changing sizes", () => {
    const layout = defaultRightSidebarLayout();
    const next = toggleRightSidebarSection(layout, "backlinks");

    expect(next.collapsed.backlinks).toBe(true);
    expect(next.collapsed.outline).toBe(false);
    expect(next.sizes).toEqual(layout.sizes);
  });
});
