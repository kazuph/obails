package models

// State represents the application session state stored in vault
type State struct {
	LastOpenedFile *LastOpenedFile `json:"lastOpenedFile,omitempty"`
}

// LastOpenedFile represents the last opened file information
type LastOpenedFile struct {
	Path     string `json:"path"`
	FileType string `json:"fileType"`
}

// DefaultState returns the default state
func DefaultState() *State {
	return &State{}
}
