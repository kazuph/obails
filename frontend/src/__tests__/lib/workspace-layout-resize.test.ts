import { describe, expect, it } from "vitest";
import { splitWeightsFromPointer, workspaceLayoutTree } from "../../lib/workspace-layout";

describe("splitWeightsFromPointer", () => {
  it("derives only the nested split path weights from the parent pointer position", () => {
    const root = workspaceLayoutTree({
      splitDirection: "horizontal",
      children: [
        { splitDirection: "vertical", children: [{ paneId: "top" }, { paneId: "bottom" }], weights: [3, 1] },
        { paneId: "right" },
      ],
      weights: [4, 1],
    });
    expect(splitWeightsFromPointer(root, [0], 0, 60, 100)).toEqual([2.4, 1.6]);
  });

  it("rejects an edge position instead of sending non-positive backend weights", () => {
    const root = workspaceLayoutTree({ splitDirection: "horizontal", children: [{ paneId: "a" }, { paneId: "b" }], weights: [1, 1] });
    expect(splitWeightsFromPointer(root, [], 0, 0, 100)).toBeNull();
  });
});
