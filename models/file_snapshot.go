package models

const (
	FileSaveStatusSaved    = "saved"
	FileSaveStatusConflict = "conflict"
	FileSaveStatusMissing  = "missing"
)

// FileSnapshot binds an editable file path and content to its SHA-256 revision.
type FileSnapshot struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	Revision string `json:"revision"`
}

// FileSaveResult describes a compare-and-swap save outcome.
type FileSaveResult struct {
	Status   string        `json:"status"`
	Snapshot *FileSnapshot `json:"snapshot,omitempty"`
}
