package models

import (
	"fmt"
	"path"
	"strings"
)

// AttachmentLocation identifies one of Obsidian's supported attachment destinations.
type AttachmentLocation string

const (
	AttachmentLocationVaultRoot        AttachmentLocation = "vault_root"
	AttachmentLocationVaultFolder      AttachmentLocation = "vault_folder"
	AttachmentLocationCurrentFolder    AttachmentLocation = "current_folder"
	AttachmentLocationCurrentSubfolder AttachmentLocation = "current_subfolder"
)

// AttachmentConfig controls where an attachment dropped into a note is copied.
type AttachmentConfig struct {
	Location AttachmentLocation `toml:"location" json:"location"`
	Folder   string             `toml:"folder" json:"folder"`
}

// AttachmentImportResult is the in-vault copy path and the Markdown embed to insert.
type AttachmentImportResult struct {
	DestinationPath string `json:"destinationPath"`
	Embed           string `json:"embed"`
}

func DefaultAttachmentConfig() AttachmentConfig {
	return AttachmentConfig{Location: AttachmentLocationVaultRoot}
}

// NormalizeAttachmentConfig applies the backwards-compatible root default and
// rejects configurations that do not map to one of the four supported choices.
func NormalizeAttachmentConfig(config AttachmentConfig) (AttachmentConfig, error) {
	if config.Location == "" {
		config.Location = AttachmentLocationVaultRoot
	}
	if !config.Location.IsValid() {
		return AttachmentConfig{}, fmt.Errorf("invalid attachment location: %q", config.Location)
	}
	if err := validateAttachmentFolder(config.Folder); err != nil {
		return AttachmentConfig{}, err
	}

	switch config.Location {
	case AttachmentLocationVaultRoot, AttachmentLocationCurrentFolder:
		if config.Folder != "" {
			return AttachmentConfig{}, fmt.Errorf("attachment folder must be empty for %q", config.Location)
		}
	case AttachmentLocationVaultFolder, AttachmentLocationCurrentSubfolder:
		if config.Folder == "" {
			return AttachmentConfig{}, fmt.Errorf("attachment folder is required for %q", config.Location)
		}
	}
	return config, nil
}

func (location AttachmentLocation) IsValid() bool {
	switch location {
	case AttachmentLocationVaultRoot, AttachmentLocationVaultFolder, AttachmentLocationCurrentFolder, AttachmentLocationCurrentSubfolder:
		return true
	default:
		return false
	}
}

func validateAttachmentFolder(folder string) error {
	if folder == "" {
		return nil
	}
	if strings.Contains(folder, `\`) || path.IsAbs(folder) || path.Clean(folder) != folder {
		return fmt.Errorf("invalid attachment folder: %q", folder)
	}
	for _, segment := range strings.Split(folder, "/") {
		if segment == "." || segment == ".." {
			return fmt.Errorf("invalid attachment folder: %q", folder)
		}
	}
	return nil
}
