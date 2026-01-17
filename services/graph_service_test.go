package services

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kazuph/obails/models"
)

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

	// Should have 2 nodes: one for the file and one for the unresolved link
	if len(graph.Nodes) != 2 {
		t.Errorf("Expected 2 nodes (including unresolved), got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 1 {
		t.Errorf("Expected 1 edge, got %d", len(graph.Edges))
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
