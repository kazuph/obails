package models

import "time"

// Note represents a markdown note
type Note struct {
	Path        string         `json:"path"`
	Title       string         `json:"title"`
	Content     string         `json:"content"`
	Frontmatter map[string]any `json:"frontmatter"`
	ModifiedAt  time.Time      `json:"modifiedAt"`
}

// Thino represents a quick memo entry in daily notes
type Thino struct {
	Time    string `json:"time"`    // "10:38"
	Content string `json:"content"` // The memo content
	IsTodo  bool   `json:"isTodo"`  // true if [ ] or [x]
	Done    bool   `json:"done"`    // true if [x]
}

// FileInfo represents a file or directory in the vault
type FileInfo struct {
	Name       string     `json:"name"`
	Path       string     `json:"path"`
	IsDir      bool       `json:"isDir"`
	Children   []FileInfo `json:"children,omitempty"`
	ModifiedAt time.Time  `json:"modifiedAt"`
}

// Link represents a wiki-style link [[text]]
type Link struct {
	Text       string `json:"text"`       // The link text
	TargetPath string `json:"targetPath"` // Resolved file path
	Exists     bool   `json:"exists"`     // Whether target exists
}

// Backlink represents a reference from another note
type Backlink struct {
	SourcePath  string `json:"sourcePath"`
	SourceTitle string `json:"sourceTitle"`
	Context     string `json:"context"` // Text around the link
}
