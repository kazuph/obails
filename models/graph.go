package models

// GraphNode represents a node in the knowledge graph
type GraphNode struct {
	ID        string   `json:"id"`        // Graph-unique node identifier
	Label     string   `json:"label"`     // Display name (note title)
	LinkCount int      `json:"linkCount"` // Number of connections (for sizing)
	Path      string   `json:"path,omitempty"`
	Type      string   `json:"type,omitempty"`
	Tags      []string `json:"tags,omitempty"`
}

// GraphEdge represents an edge between two nodes
type GraphEdge struct {
	Source string `json:"source"` // Source node ID
	Target string `json:"target"` // Target node ID
}

// Graph represents the complete knowledge graph
type Graph struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

// GraphOptions filters graph material already captured in one link-index generation.
// Empty options preserve the historical full-note graph.
type GraphOptions struct {
	IncludeUnresolved  bool     `json:"includeUnresolved"`
	IncludeAttachments bool     `json:"includeAttachments"`
	ExcludeOrphans     bool     `json:"excludeOrphans"`
	Tags               []string `json:"tags,omitempty"`
	ExcludeTags        []string `json:"excludeTags,omitempty"`
	Search             string   `json:"search,omitempty"`
	RootPath           string   `json:"rootPath,omitempty"`
	Depth              int      `json:"depth"`
}

// GraphSnapshot is graph material derived entirely from one link-index generation.
type GraphSnapshot struct {
	LinkIndexState
	Graph Graph `json:"graph"`
}
