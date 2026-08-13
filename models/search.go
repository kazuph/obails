package models

import "time"

// SearchSort selects the ordering for vault search results.
type SearchSort string

const (
	SearchSortFileNameAscending  SearchSort = "file-name-ascending"
	SearchSortFileNameDescending SearchSort = "file-name-descending"
	SearchSortModifiedNewest     SearchSort = "modified-newest"
	SearchSortModifiedOldest     SearchSort = "modified-oldest"
)

// SearchOptions controls query evaluation and presentation data. A zero
// ContextRunes keeps the complete matching line; a positive value truncates it
// at that many Unicode code points and appends an ellipsis when needed.
type SearchOptions struct {
	Query        string     `json:"query"`
	MatchCase    bool       `json:"matchCase"`
	Sort         SearchSort `json:"sort"`
	ContextRunes int        `json:"contextRunes"`
	Limit        int        `json:"limit"`
}

// VaultSearchResult contains the file metadata and matching context needed by
// search result sorting and context display controls.
type VaultSearchResult struct {
	Path       string    `json:"path"`
	Title      string    `json:"title"`
	FileName   string    `json:"fileName"`
	Line       int       `json:"line,omitempty"`
	Context    string    `json:"context,omitempty"`
	MatchCount int       `json:"matchCount"`
	ModifiedAt time.Time `json:"modifiedAt"`
}
