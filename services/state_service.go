package services

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/kazuph/obails/models"
)

// StateService handles application session state stored in vault
type StateService struct {
	configService *ConfigService
	state         *models.State
}

// NewStateService creates a new StateService
func NewStateService(configService *ConfigService) *StateService {
	return &StateService{
		configService: configService,
		state:         models.DefaultState(),
	}
}

// getStatePath returns the path to the state file
func (s *StateService) getStatePath() string {
	vaultPath := s.configService.GetVaultPath()
	if vaultPath == "" {
		return ""
	}
	return filepath.Join(vaultPath, ".obails", "state.json")
}

// Load reads state from file
func (s *StateService) Load() error {
	statePath := s.getStatePath()
	if statePath == "" {
		return nil
	}

	// Check if state file exists
	if _, err := os.Stat(statePath); os.IsNotExist(err) {
		return nil
	}

	// Read state file
	data, err := os.ReadFile(statePath)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, s.state)
}

// Save writes state to file
func (s *StateService) Save() error {
	statePath := s.getStatePath()
	if statePath == "" {
		return nil
	}

	// Ensure .obails directory exists
	stateDir := filepath.Dir(statePath)
	if err := os.MkdirAll(stateDir, 0755); err != nil {
		return err
	}

	// Write state file with pretty formatting
	data, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(statePath, data, 0644)
}

// SetLastOpenedFile sets the last opened file and saves
func (s *StateService) SetLastOpenedFile(path string, fileType string) error {
	s.state.LastOpenedFile = &models.LastOpenedFile{
		Path:     path,
		FileType: fileType,
	}
	return s.Save()
}

// GetLastOpenedFile returns the last opened file information
func (s *StateService) GetLastOpenedFile() *models.LastOpenedFile {
	return s.state.LastOpenedFile
}

// ClearLastOpenedFile clears the last opened file and saves
func (s *StateService) ClearLastOpenedFile() error {
	s.state.LastOpenedFile = nil
	return s.Save()
}
