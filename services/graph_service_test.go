package services

import (
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kazuph/obails/models"
)

func TestLocalGraphNodesStopsAfterExhaustingACycle(t *testing.T) {
	done := make(chan map[string]bool, 1)
	go func() {
		done <- localGraphNodes("a", math.MaxInt, map[string]bool{"a": true, "b": true}, []models.GraphEdge{
			{Source: "a", Target: "b"},
			{Source: "b", Target: "a"},
		})
	}()

	select {
	case nodes := <-done:
		if len(nodes) != 2 || !nodes["a"] || !nodes["b"] {
			t.Fatalf("cycle traversal returned the wrong nodes: %#v", nodes)
		}
	case <-time.After(time.Second):
		t.Fatal("cycle traversal kept revisiting nodes after the frontier was exhausted")
	}
}

func newTestGraphService(t *testing.T) (*GraphService, *LinkService, *FileService, string) {
	t.Helper()
	tmpDir, err := os.MkdirTemp("", "obails-graph-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	cs := &ConfigService{
		configPath: filepath.Join(tmpDir, "config.toml"),
		config: &models.Config{
			Vault: models.VaultConfig{
				Path: tmpDir,
			},
		},
	}

	fs := NewFileService(cs)
	ls := NewLinkService(fs, cs)
	gs := NewGraphService(ls, fs, cs)
	return gs, ls, fs, tmpDir
}

func TestGraphService_GetFullGraph_Empty(t *testing.T) {
	gs, _, _, tmpDir := newTestGraphService(t)
	defer os.RemoveAll(tmpDir)

	graph := gs.GetFullGraph()

	if len(graph.Nodes) != 0 {
		t.Errorf("Expected 0 nodes, got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 0 {
		t.Errorf("Expected 0 edges, got %d", len(graph.Edges))
	}
}

func TestGraphService_GetFullGraph_SingleNode(t *testing.T) {
	gs, ls, _, tmpDir := newTestGraphService(t)
	defer os.RemoveAll(tmpDir)

	// Create a single file with no links
	content := "# Test Note\n\nThis is a test note with no links."
	if err := os.WriteFile(filepath.Join(tmpDir, "test.md"), []byte(content), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Rebuild index
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("Failed to rebuild index: %v", err)
	}

	graph := gs.GetFullGraph()

	if len(graph.Nodes) != 1 {
		t.Errorf("Expected 1 node, got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 0 {
		t.Errorf("Expected 0 edges, got %d", len(graph.Edges))
	}

	// Check node details
	if len(graph.Nodes) > 0 {
		node := graph.Nodes[0]
		if node.ID != "test.md" {
			t.Errorf("Expected node ID 'test.md', got '%s'", node.ID)
		}
		if node.Label != "test" {
			t.Errorf("Expected node label 'test', got '%s'", node.Label)
		}
	}
}

func TestGraphService_GetFullGraph_TwoNodesWithLink(t *testing.T) {
	gs, ls, _, tmpDir := newTestGraphService(t)
	defer os.RemoveAll(tmpDir)

	// Create two files with a link between them
	noteA := "# Note A\n\nThis links to [[Note B]]."
	noteB := "# Note B\n\nThis is Note B."

	if err := os.WriteFile(filepath.Join(tmpDir, "Note A.md"), []byte(noteA), 0644); err != nil {
		t.Fatalf("Failed to create Note A: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "Note B.md"), []byte(noteB), 0644); err != nil {
		t.Fatalf("Failed to create Note B: %v", err)
	}

	// Rebuild index
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("Failed to rebuild index: %v", err)
	}

	graph := gs.GetFullGraph()

	if len(graph.Nodes) != 2 {
		t.Errorf("Expected 2 nodes, got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 1 {
		t.Errorf("Expected 1 edge, got %d", len(graph.Edges))
	}

	// Check edge details
	if len(graph.Edges) > 0 {
		edge := graph.Edges[0]
		if edge.Source != "Note A.md" {
			t.Errorf("Expected edge source 'Note A.md', got '%s'", edge.Source)
		}
		if edge.Target != "Note B.md" {
			t.Errorf("Expected edge target 'Note B.md', got '%s'", edge.Target)
		}
	}
}

func TestGraphService_GetFullGraph_BidirectionalLinks(t *testing.T) {
	gs, ls, _, tmpDir := newTestGraphService(t)
	defer os.RemoveAll(tmpDir)

	// Create two files that link to each other
	noteA := "# Note A\n\nThis links to [[Note B]]."
	noteB := "# Note B\n\nThis links back to [[Note A]]."

	if err := os.WriteFile(filepath.Join(tmpDir, "Note A.md"), []byte(noteA), 0644); err != nil {
		t.Fatalf("Failed to create Note A: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "Note B.md"), []byte(noteB), 0644); err != nil {
		t.Fatalf("Failed to create Note B: %v", err)
	}

	// Rebuild index
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("Failed to rebuild index: %v", err)
	}

	graph := gs.GetFullGraph()

	if len(graph.Nodes) != 2 {
		t.Errorf("Expected 2 nodes, got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 2 {
		t.Errorf("Expected 2 edges, got %d", len(graph.Edges))
	}
}

func TestGraphService_GetFullGraph_MultipleLinks(t *testing.T) {
	gs, ls, _, tmpDir := newTestGraphService(t)
	defer os.RemoveAll(tmpDir)

	// Create a hub-and-spoke structure
	hub := "# Hub\n\nLinks to [[Spoke 1]], [[Spoke 2]], and [[Spoke 3]]."
	spoke1 := "# Spoke 1\n\nConnected to hub."
	spoke2 := "# Spoke 2\n\nConnected to hub."
	spoke3 := "# Spoke 3\n\nConnected to hub."

	if err := os.WriteFile(filepath.Join(tmpDir, "Hub.md"), []byte(hub), 0644); err != nil {
		t.Fatalf("Failed to create Hub: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "Spoke 1.md"), []byte(spoke1), 0644); err != nil {
		t.Fatalf("Failed to create Spoke 1: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "Spoke 2.md"), []byte(spoke2), 0644); err != nil {
		t.Fatalf("Failed to create Spoke 2: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "Spoke 3.md"), []byte(spoke3), 0644); err != nil {
		t.Fatalf("Failed to create Spoke 3: %v", err)
	}

	// Rebuild index
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("Failed to rebuild index: %v", err)
	}

	graph := gs.GetFullGraph()

	if len(graph.Nodes) != 4 {
		t.Errorf("Expected 4 nodes, got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 3 {
		t.Errorf("Expected 3 edges, got %d", len(graph.Edges))
	}

	// Check that Hub has highest link count
	var hubNode *models.GraphNode
	for i := range graph.Nodes {
		if graph.Nodes[i].Label == "Hub" {
			hubNode = &graph.Nodes[i]
			break
		}
	}
	if hubNode == nil {
		t.Error("Hub node not found")
	} else if hubNode.LinkCount != 3 {
		t.Errorf("Expected Hub link count 3, got %d", hubNode.LinkCount)
	}
}

func TestGraphService_GetFullGraph_UnresolvedLinks(t *testing.T) {
	gs, ls, _, tmpDir := newTestGraphService(t)
	defer os.RemoveAll(tmpDir)

	// Create a file with a link to non-existent file
	content := "# Test\n\nLinks to [[Non Existent Note]]."

	if err := os.WriteFile(filepath.Join(tmpDir, "test.md"), []byte(content), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Rebuild index
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("Failed to rebuild index: %v", err)
	}

	graph := gs.GetFullGraph()

	// Unresolved links (links to non-existent files) are filtered out from the graph
	// Should have only 1 node: the source file (non-existent targets are excluded)
	if len(graph.Nodes) != 1 {
		t.Errorf("Expected 1 node (unresolved links filtered out), got %d", len(graph.Nodes))
	}
	// Should have 0 edges: no edge to non-existent file
	if len(graph.Edges) != 0 {
		t.Errorf("Expected 0 edges (unresolved links filtered out), got %d", len(graph.Edges))
	}
}

func TestGraphService_GetGraphStats(t *testing.T) {
	gs, ls, _, tmpDir := newTestGraphService(t)
	defer os.RemoveAll(tmpDir)

	// Create two linked notes
	noteA := "# Note A\n\nLinks to [[Note B]]."
	noteB := "# Note B\n\nNo links."

	if err := os.WriteFile(filepath.Join(tmpDir, "Note A.md"), []byte(noteA), 0644); err != nil {
		t.Fatalf("Failed to create Note A: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "Note B.md"), []byte(noteB), 0644); err != nil {
		t.Fatalf("Failed to create Note B: %v", err)
	}

	// Rebuild index
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("Failed to rebuild index: %v", err)
	}

	stats := gs.GetGraphStats()

	if stats["nodeCount"] != 2 {
		t.Errorf("Expected nodeCount 2, got %d", stats["nodeCount"])
	}
	if stats["edgeCount"] != 1 {
		t.Errorf("Expected edgeCount 1, got %d", stats["edgeCount"])
	}
}

func TestGraphService_GetFullGraph_NestedDirectories(t *testing.T) {
	gs, ls, _, tmpDir := newTestGraphService(t)
	defer os.RemoveAll(tmpDir)

	// Create nested directory structure
	subDir := filepath.Join(tmpDir, "subdir")
	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatalf("Failed to create subdir: %v", err)
	}

	rootNote := "# Root\n\nLinks to [[SubNote]]."
	subNote := "# SubNote\n\nThis is in a subdirectory."

	if err := os.WriteFile(filepath.Join(tmpDir, "Root.md"), []byte(rootNote), 0644); err != nil {
		t.Fatalf("Failed to create Root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(subDir, "SubNote.md"), []byte(subNote), 0644); err != nil {
		t.Fatalf("Failed to create SubNote: %v", err)
	}

	// Rebuild index
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("Failed to rebuild index: %v", err)
	}

	graph := gs.GetFullGraph()

	if len(graph.Nodes) < 2 {
		t.Errorf("Expected at least 2 nodes, got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 1 {
		t.Errorf("Expected 1 edge, got %d", len(graph.Edges))
	}
}

func TestGraphService_GetFullGraph_DeduplicatesEdgesAndDisambiguatesDuplicateLabels(t *testing.T) {
	gs, ls, fs, tmpDir := newTestGraphService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateFile("folder-a/shared.md", "# A")
	fs.CreateFile("folder-b/shared.md", "# B")
	fs.CreateFile("source.md", "[[shared]]\n[Shared again](folder-a/shared.md)")

	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}

	graph := gs.GetFullGraph()
	labels := make(map[string]string, len(graph.Nodes))
	for _, node := range graph.Nodes {
		labels[node.ID] = node.Label
	}
	if labels["folder-a/shared.md"] == labels["folder-b/shared.md"] {
		t.Errorf("duplicate basenames need path-distinguishable graph labels: %#v", labels)
	}

	edges := make(map[string]bool)
	for _, edge := range graph.Edges {
		key := edge.Source + "->" + edge.Target
		if edges[key] {
			t.Errorf("duplicate graph edge %q", key)
		}
		edges[key] = true
	}
}

func TestGraphService_GetGraphFromLinkSnapshot_UsesOneGenerationAndMarkdownExtension(t *testing.T) {
	gs, ls, fs, tmpDir := newTestGraphService(t)
	defer os.RemoveAll(tmpDir)

	if snapshot := gs.GetFullGraphSnapshot(); snapshot.Ready || snapshot.Generation != 0 {
		t.Fatalf("graph must report an unready index instead of treating it as an empty vault: %#v", snapshot)
	}
	fs.CreateFile("source.markdown", "[[target]]")
	fs.CreateFile("target.markdown", "# Target")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}

	indexSnapshot := ls.GetLinkIndexSnapshot()
	graphSnapshot := gs.GetGraphFromLinkSnapshot(indexSnapshot)
	if !graphSnapshot.Ready || graphSnapshot.Generation != indexSnapshot.Generation {
		t.Fatalf("graph must identify the source index generation: graph=%#v index=%#v", graphSnapshot.LinkIndexState, indexSnapshot.LinkIndexState)
	}
	if len(graphSnapshot.Graph.Nodes) != 2 || len(graphSnapshot.Graph.Edges) != 1 {
		t.Fatalf(".markdown files must participate as graph nodes and edges: %#v", graphSnapshot.Graph)
	}
	backlinks := ls.GetBacklinksFromSnapshot(indexSnapshot, "target.markdown")
	if backlinks.Generation != graphSnapshot.Generation || len(backlinks.Backlinks) != 1 {
		t.Fatalf("graph and backlinks must be readable from the same supplied generation: graph=%d backlinks=%#v", graphSnapshot.Generation, backlinks)
	}
}

func TestGraphService_GetGraph_OptionsUseOneGeneration(t *testing.T) {
	gs, ls, fs, tmpDir := newTestGraphService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateFile("root.md", "---\ntags: [alpha]\n---\n# Root\nInline #inline and `#code`\n```md\n#fenced\n```\n[[one]] [[missing target]] [[missing target]] ![Photo](assets/photo.png)")
	fs.CreateFile("one.md", "---\ntags: [beta]\n---\n[[folder/two]]")
	fs.CreateFile("folder/two.md", "---\ntags: [alpha]\n---\n# Needle")
	fs.CreateFile("orphan.md", "---\ntags: [alpha]\n---\n# Orphan")
	fs.CreateFile("assets/photo.png", "image bytes")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}
	first := ls.GetLinkIndexSnapshot()
	if got := first.Metadata["root.md"].Tags; len(got) != 2 || got[0] != "alpha" || got[1] != "inline" {
		t.Fatalf("frontmatter and renderable inline tags must be captured once: %#v", got)
	}
	if got := first.Metadata["folder/two.md"].Tags; len(got) != 1 || got[0] != "alpha" {
		t.Fatalf("heading marker must not become a tag: %#v", got)
	}
	if got := renderableInlineTags("Unmatched ` is literal #after"); len(got) != 1 || got[0] != "after" {
		t.Fatalf("an unmatched backtick must not hide later renderable tags: %#v", got)
	}

	full, err := gs.GetGraph(models.GraphOptions{})
	if err != nil || len(full.Nodes) != 4 || len(full.Edges) != 2 {
		t.Fatalf("zero options must preserve full-note graph: graph=%#v err=%v", full, err)
	}
	withTargets, err := gs.GetGraph(models.GraphOptions{IncludeUnresolved: true, IncludeAttachments: true})
	if err != nil {
		t.Fatalf("GetGraph with target types failed: %v", err)
	}
	if len(withTargets.Nodes) != 6 || len(withTargets.Edges) != 4 {
		t.Fatalf("expected note, unresolved, and attachment nodes with deduplicated edges: %#v", withTargets)
	}
	for _, node := range withTargets.Nodes {
		if node.Type == "unresolved" && (node.ID == "missing target" || node.Label != "missing target") {
			t.Errorf("unresolved node needs a structured ID and readable label: %#v", node)
		}
		if node.Type == "attachment" && (node.ID == "assets/photo.png" || node.Path != "assets/photo.png" || node.Label != "photo") {
			t.Errorf("attachment node needs a structured ID, path, and readable label: %#v", node)
		}
	}

	for depth, wantNodes := range map[int]int{0: 1, 1: 2, 2: 3} {
		local, err := gs.GetGraph(models.GraphOptions{RootPath: "root.md", Depth: depth})
		if err != nil || len(local.Nodes) != wantNodes {
			t.Errorf("local depth %d = %#v, %v; want %d nodes", depth, local, err, wantNodes)
		}
	}
	if _, err := gs.GetGraph(models.GraphOptions{RootPath: "root.md", Depth: -1}); err == nil {
		t.Error("negative local graph depth must be rejected")
	}

	assertGraphNodeIDs(t, gs, models.GraphOptions{Tags: []string{"alpha"}}, "folder/two.md", "orphan.md", "root.md")
	assertGraphNodeIDs(t, gs, models.GraphOptions{ExcludeTags: []string{"alpha"}}, "one.md")
	assertGraphNodeIDs(t, gs, models.GraphOptions{Search: "two"}, "folder/two.md")
	assertGraphNodeIDs(t, gs, models.GraphOptions{Search: "folder/two"}, "folder/two.md")
	assertGraphNodeIDs(t, gs, models.GraphOptions{Search: "beta"}, "one.md")
	assertGraphNodeIDs(t, gs, models.GraphOptions{Search: "orphan.md"}, "orphan.md")
	assertGraphNodeIDs(t, gs, models.GraphOptions{Tags: []string{"inline"}}, "root.md")
	assertGraphNodeIDs(t, gs, models.GraphOptions{Tags: []string{"code"}})
	assertGraphNodeIDs(t, gs, models.GraphOptions{Tags: []string{"fenced"}})
	assertGraphNodeIDs(t, gs, models.GraphOptions{ExcludeOrphans: true}, "folder/two.md", "one.md", "root.md")

	fs.CreateFile("root.md", "---\ntags: [changed]\n---\n[[one]]")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("second RebuildIndex failed: %v", err)
	}
	oldGeneration, err := gs.GetGraphFromLinkSnapshotWithOptions(first, models.GraphOptions{Tags: []string{"alpha"}})
	if err != nil || oldGeneration.Generation != first.Generation {
		t.Fatalf("old graph snapshot lost its generation: %#v, %v", oldGeneration, err)
	}
	if !hasGraphNode(oldGeneration.Graph, "root.md") {
		t.Fatalf("old generation must retain its copied tags: %#v", oldGeneration.Graph.Nodes)
	}
}

func assertGraphNodeIDs(t *testing.T, gs *GraphService, options models.GraphOptions, want ...string) {
	t.Helper()
	graph, err := gs.GetGraph(options)
	if err != nil {
		t.Fatalf("GetGraph(%#v) failed: %v", options, err)
	}
	got := make([]string, 0, len(graph.Nodes))
	for _, node := range graph.Nodes {
		got = append(got, node.ID)
	}
	if len(got) != len(want) {
		t.Fatalf("GetGraph(%#v) nodes = %#v, want %#v", options, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("GetGraph(%#v) nodes = %#v, want %#v", options, got, want)
		}
	}
}

func hasGraphNode(graph models.Graph, id string) bool {
	for _, node := range graph.Nodes {
		if node.ID == id {
			return true
		}
	}
	return false
}
