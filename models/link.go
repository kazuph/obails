package models

// LinkIndexState distinguishes an empty published index from an index that is not ready yet.
type LinkIndexState struct {
	Ready      bool   `json:"ready"`
	Generation uint64 `json:"generation"`
	Rebuilding bool   `json:"rebuilding"`
}

// LinkIndexSnapshot is immutable-by-copy data for one published link-index generation.
// All vault-controlled strings remain raw structured fields; this API never produces HTML.
type LinkIndexSnapshot struct {
	LinkIndexState
	Links     map[string][]Link       `json:"links"`
	Backlinks map[string][]Backlink   `json:"backlinks"`
	Metadata  map[string]LinkMetadata `json:"metadata"`
}

// LinkMetadata is note metadata captured with the link-index generation.
type LinkMetadata struct {
	Tags []string `json:"tags,omitempty"`
}

// BacklinksResult lets callers distinguish a not-ready response from zero backlinks.
type BacklinksResult struct {
	LinkIndexState
	Backlinks []Backlink `json:"backlinks"`
}

// UnlinkedMention is renderable prose that names a resolved note without linking to it.
// All text remains vault-controlled raw text for the caller to render safely.
type UnlinkedMention struct {
	SourcePath  string `json:"sourcePath"`
	SourceTitle string `json:"sourceTitle"`
	TargetPath  string `json:"targetPath"`
	TargetTitle string `json:"targetTitle"`
	Match       string `json:"match"`
	Context     string `json:"context"`
}

// UnlinkedMentionsResult is bound to a single published link-index generation.
type UnlinkedMentionsResult struct {
	LinkIndexState
	Mentions []UnlinkedMention `json:"mentions"`
}

// TransclusionResult contains the Markdown selected by a resolved note embed.
// Attachments remain Link metadata only and do not expose file bytes through this API.
type TransclusionResult struct {
	TargetPath   string `json:"targetPath"`
	Content      string `json:"content"`
	Generation   uint64 `json:"generation"`
	Fragment     string `json:"fragment,omitempty"`
	FragmentType string `json:"fragmentType,omitempty"`
}
