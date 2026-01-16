package models

// GraphNode represents a node in the knowledge graph
type GraphNode struct {
	ID        string `json:"id"`        // File path (unique identifier)
	Label     string `json:"label"`     // Display name (note title)
	LinkCount int    `json:"linkCount"` // Number of connections (for sizing)
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
