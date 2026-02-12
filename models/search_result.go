package models

// SearchResult represents a content search match within a file
type SearchResult struct {
	Path    string `json:"path"`
	Title   string `json:"title"`
	Line    int    `json:"line,omitempty"`
	Context string `json:"context,omitempty"`
}
