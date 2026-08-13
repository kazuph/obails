import { describe, expect, it } from "vitest";
import { withoutWorkspacePanes, workspaceLayoutTree } from "../../lib/workspace-layout";

describe("workspaceLayoutTree", () => {
  it("preserves nested split directions and explicit sibling proportions", () => {
    const layout = workspaceLayoutTree({
      splitDirection: "horizontal",
      weights: [3, 1],
      children: [
        { paneId: "left" },
        { splitDirection: "vertical", children: [{ paneId: "top" }, { paneId: "bottom" }] },
      ],
    });

    expect(layout.direction).toBe("horizontal");
    expect(layout.children.map((child) => child.weight)).toEqual([3, 1]);
    expect(layout.children[1].direction).toBe("vertical");
    expect(layout.children[1].children.map((child) => child.weight)).toEqual([1, 1]);
  });

  it("removes native-popout panes without leaving an empty split in the main window", () => {
    const layout = workspaceLayoutTree({
      splitDirection: "horizontal",
      weights: [3, 1],
      children: [{ splitDirection: "vertical", children: [{ paneId: "popout" }, { paneId: "main" }] }, { paneId: "side" }],
    });
    const visible = withoutWorkspacePanes(layout, new Set(["popout"]));

    expect(visible?.direction).toBe("horizontal");
    expect(visible?.children.map((child) => child.paneId)).toEqual(["main", "side"]);
    expect(visible?.children.map((child) => child.weight)).toEqual([3, 1]);
  });
});
