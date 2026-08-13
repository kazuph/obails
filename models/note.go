package models

import "time"

// Note represents a markdown note
type Note struct {
	Path        string         `json:"path"`
	Title       string         `json:"title"`
	Content     string         `json:"content"`
	Revision    string         `json:"revision"`
	Frontmatter map[string]any `json:"frontmatter"`
	ModifiedAt  time.Time      `json:"modifiedAt"`
}

// Timeline represents a quick memo entry in daily notes
type Timeline struct {
	Time    string `json:"time"`    // "10:38"
	Content string `json:"content"` // The memo content
	IsTodo  bool   `json:"isTodo"`  // true if [ ] or [x]
	Done    bool   `json:"done"`    // true if [x]
	Date    string `json:"date"`    // "Today", "Yesterday", or "MM/DD"
}

// FileType constants
const (
	FileTypeMarkdown = "markdown"
	FileTypeImage    = "image"
	FileTypePDF      = "pdf"
	FileTypeHTML     = "html"
	FileTypeAudio    = "audio"
	FileTypeText     = "text"
	FileTypeOther    = "other"
)

// FileInfo represents a file or directory in the vault
type FileInfo struct {
	Name       string     `json:"name"`
	Path       string     `json:"path"`
	IsDir      bool       `json:"isDir"`
	FileType   string     `json:"fileType,omitempty"` // markdown, image, pdf, html, audio, other
	Children   []FileInfo `json:"children,omitempty"`
	ModifiedAt time.Time  `json:"modifiedAt"`
	CreatedAt  time.Time  `json:"createdAt"`
}

type ImportStatus string

const (
	ImportStatusImported  ImportStatus = "imported"
	ImportStatusCollision ImportStatus = "collision"
)

// ImportOutcome reports the immutable result for one external source path.
type ImportOutcome struct {
	SourcePath      string       `json:"sourcePath"`
	DestinationPath string       `json:"destinationPath"`
	Status          ImportStatus `json:"status"`
	IsDir           bool         `json:"isDir"`
}

// Link represents a wiki-style link [[text]]
type Link struct {
	Text         string `json:"text"`                   // Vault-controlled target text, without fragment
	TargetPath   string `json:"targetPath"`             // Resolved vault-relative path
	Exists       bool   `json:"exists"`                 // Whether target exists
	Generation   uint64 `json:"generation"`             // Published link-index generation that resolved this link
	Alias        string `json:"alias,omitempty"`        // Rendered alias or Markdown label
	Fragment     string `json:"fragment,omitempty"`     // Heading or block fragment without the marker
	FragmentType string `json:"fragmentType,omitempty"` // heading or block
	Kind         string `json:"kind"`                   // wikilink or markdown
	IsEmbed      bool   `json:"isEmbed"`                // Transclusion/attachment syntax
	Width        *int   `json:"width,omitempty"`        // Explicit Wiki image width; no implicit default
	Height       *int   `json:"height,omitempty"`       // Explicit Wiki image height; no implicit default
	Raw          string `json:"raw"`                    // Original vault text; callers must escape on rendering
}

// Backlink represents a reference from another note
type Backlink struct {
	SourcePath  string `json:"sourcePath"`
	SourceTitle string `json:"sourceTitle"`
	Context     string `json:"context"` // Raw text around the link; callers must escape on rendering
	Link        Link   `json:"link"`
}
