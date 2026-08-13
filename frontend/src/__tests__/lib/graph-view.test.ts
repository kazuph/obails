import { describe, expect, it } from "vitest";
import {
  GRAPH_DEPTH_OPTIONS,
  buildGraphOptions,
  canOpenGraphNode,
  getGraphDirection,
  hasActiveGraphFilters,
  parseGraphTags,
  resolveGraphEdgeNavigation,
  resolveGraphListNavigation,
  type GraphFilterValues,
} from "../../lib/graph-view";

const defaultFilters: GraphFilterValues = {
  includeUnresolved: false,
  includeAttachments: false,
  excludeOrphans: false,
  tags: "",
  excludeTags: "",
  search: "",
  rootPath: "",
  depth: 0,
};

describe("graph view options", () => {
  it("uses only the backend-supported local graph depths", () => {
    expect(GRAPH_DEPTH_OPTIONS).toEqual([0, 1, 2]);
  });

  it("builds structured options from the graph controls", () => {
    expect(buildGraphOptions({
      ...defaultFilters,
      includeUnresolved: true,
      excludeOrphans: true,
      tags: "project, work project",
      excludeTags: "archive",
      search: "  roadmap  ",
      rootPath: " notes/root.md ",
      depth: 2,
    })).toEqual({
      includeUnresolved: true,
      includeAttachments: false,
      excludeOrphans: true,
      tags: ["project", "work"],
      excludeTags: ["archive"],
      search: "roadmap",
      rootPath: "notes/root.md",
      depth: 2,
    });
  });

  it("does not treat the depth selector alone as a filtered graph", () => {
    expect(hasActiveGraphFilters({ ...defaultFilters, depth: 2 })).toBe(false);
    expect(hasActiveGraphFilters({ ...defaultFilters, rootPath: "root.md", depth: 2 })).toBe(true);
  });

  it("deduplicates comma and whitespace separated tags", () => {
    expect(parseGraphTags("alpha, beta alpha\n gamma")).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("graph direction", () => {
  const graph = {
    nodes: [
      { id: "in.md", label: "Incoming", path: "in.md", type: "note" },
      { id: "selected.md", label: "Selected", path: "selected.md", type: "note" },
      { id: "out.md", label: "Outgoing", path: "out.md", type: "note" },
      { id: "unresolved:missing", label: "Missing", type: "unresolved" },
    ],
    edges: [
      { source: "in.md", target: "selected.md" },
      { source: "selected.md", target: "out.md" },
      { source: "selected.md", target: "unresolved:missing" },
    ],
  };

  it("separates incoming and outgoing nodes for the selected node", () => {
    expect(getGraphDirection(graph, "selected.md")).toEqual({
      incoming: [graph.nodes[0]],
      outgoing: [graph.nodes[2], graph.nodes[3]],
    });
  });

  it("allows note actions only for a real note path", () => {
    expect(canOpenGraphNode(graph.nodes[1])).toBe(true);
    expect(canOpenGraphNode(graph.nodes[3])).toBe(false);
  });

  it("moves through the accessible node list with Up/Down", () => {
    expect(resolveGraphListNavigation(1, 3, "ArrowUp")).toBe(0);
    expect(resolveGraphListNavigation(1, 3, "ArrowDown")).toBe(2);
    expect(resolveGraphListNavigation(0, 3, "ArrowUp")).toBeNull();
    expect(resolveGraphListNavigation(2, 3, "ArrowDown")).toBeNull();
  });

  it("follows the first incoming or outgoing edge with Left/Right", () => {
    expect(resolveGraphEdgeNavigation(graph, "selected.md", "ArrowLeft")).toBe("in.md");
    expect(resolveGraphEdgeNavigation(graph, "selected.md", "ArrowRight")).toBe("out.md");
    expect(resolveGraphEdgeNavigation(graph, "in.md", "ArrowLeft")).toBeNull();
  });
});
