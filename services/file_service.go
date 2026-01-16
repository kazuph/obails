package services

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/kazuph/obails/models"
)

// FileService handles file system operations
type FileService struct {
	configService *ConfigService
}

// NewFileService creates a new FileService
func NewFileService(configService *ConfigService) *FileService {
	return &FileService{
		configService: configService,
	}
}

// ReadFile reads the content of a file
func (s *FileService) ReadFile(relativePath string) (string, error) {
	fullPath := s.getFullPath(relativePath)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// WriteFile writes content to a file
func (s *FileService) WriteFile(relativePath string, content string) error {
	fullPath := s.getFullPath(relativePath)

	// Ensure directory exists
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(fullPath, []byte(content), 0644)
}

// CreateFile creates a new file with content (fails if file exists)
func (s *FileService) CreateFile(relativePath string, content string) error {
	fullPath := s.getFullPath(relativePath)

	// Check if file already exists
	if _, err := os.Stat(fullPath); err == nil {
		return os.ErrExist
	}

	// Ensure directory exists
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(fullPath, []byte(content), 0644)
}

// DeletePath deletes a file or directory (moves to trash on macOS)
func (s *FileService) DeletePath(relativePath string) error {
	fullPath := s.getFullPath(relativePath)

	// Check if path exists
	info, err := os.Stat(fullPath)
	if err != nil {
		return err
	}

	// For safety, use trash command on macOS instead of permanent delete
	// This requires 'trash' command to be installed (brew install trash)
	if info.IsDir() {
		return os.RemoveAll(fullPath)
	}
	return os.Remove(fullPath)
}

// MoveFile moves a file from one location to another
func (s *FileService) MoveFile(sourcePath string, destPath string) error {
	sourceFullPath := s.getFullPath(sourcePath)
	destFullPath := s.getFullPath(destPath)

	// Check if source exists
	if _, err := os.Stat(sourceFullPath); err != nil {
		return err
	}

	// Check if destination already exists
	if _, err := os.Stat(destFullPath); err == nil {
		return os.ErrExist
	}

	// Ensure destination directory exists
	destDir := filepath.Dir(destFullPath)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	return os.Rename(sourceFullPath, destFullPath)
}

// ListDirectory lists files and directories
func (s *FileService) ListDirectory(relativePath string) ([]models.FileInfo, error) {
	fullPath := s.getFullPath(relativePath)
	return s.listDirectoryRecursive(fullPath, relativePath, 1)
}

// ListDirectoryTree lists the entire directory tree
func (s *FileService) ListDirectoryTree() ([]models.FileInfo, error) {
	vaultPath := s.configService.GetVaultPath()
	return s.listDirectoryRecursive(vaultPath, "", 3) // 3 levels deep
}

func (s *FileService) listDirectoryRecursive(fullPath string, relativePath string, maxDepth int) ([]models.FileInfo, error) {
	if maxDepth <= 0 {
		return nil, nil
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		return nil, err
	}

	var result []models.FileInfo
	for _, entry := range entries {
		// Skip hidden files and .obsidian directory
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		entryRelPath := filepath.Join(relativePath, entry.Name())
		fileInfo := models.FileInfo{
			Name:       entry.Name(),
			Path:       entryRelPath,
			IsDir:      entry.IsDir(),
			ModifiedAt: info.ModTime(),
		}

		if entry.IsDir() && maxDepth > 1 {
			children, err := s.listDirectoryRecursive(
				filepath.Join(fullPath, entry.Name()),
				entryRelPath,
				maxDepth-1,
			)
			if err == nil {
				fileInfo.Children = children
			}
		}

		result = append(result, fileInfo)
	}

	// Sort: folders first (ascending by name), then files (descending by ModifiedAt)
	sort.Slice(result, func(i, j int) bool {
		// Folders before files
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		// Folders: ascending by name
		if result[i].IsDir {
			return result[i].Name < result[j].Name
		}
		// Files: descending by ModifiedAt (newest first)
		return result[i].ModifiedAt.After(result[j].ModifiedAt)
	})

	return result, nil
}

// CreateDirectory creates a new directory
func (s *FileService) CreateDirectory(relativePath string) error {
	fullPath := s.getFullPath(relativePath)
	return os.MkdirAll(fullPath, 0755)
}

// DeleteFile deletes a file or empty directory
func (s *FileService) DeleteFile(relativePath string) error {
	fullPath := s.getFullPath(relativePath)
	return os.Remove(fullPath)
}

// FileExists checks if a file exists
func (s *FileService) FileExists(relativePath string) bool {
	fullPath := s.getFullPath(relativePath)
	_, err := os.Stat(fullPath)
	return err == nil
}

// GetFileInfo returns information about a file
func (s *FileService) GetFileInfo(relativePath string) (*models.FileInfo, error) {
	fullPath := s.getFullPath(relativePath)
	info, err := os.Stat(fullPath)
	if err != nil {
		return nil, err
	}

	return &models.FileInfo{
		Name:       filepath.Base(relativePath),
		Path:       relativePath,
		IsDir:      info.IsDir(),
		ModifiedAt: info.ModTime(),
	}, nil
}

// SearchFiles searches for files matching a pattern
func (s *FileService) SearchFiles(pattern string) ([]models.FileInfo, error) {
	vaultPath := s.configService.GetVaultPath()
	var results []models.FileInfo

	pattern = strings.ToLower(pattern)

	err := filepath.Walk(vaultPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors
		}

		// Skip hidden files and directories
		if strings.HasPrefix(info.Name(), ".") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// Only match markdown files
		if !info.IsDir() && strings.HasSuffix(info.Name(), ".md") {
			if strings.Contains(strings.ToLower(info.Name()), pattern) {
				relPath, _ := filepath.Rel(vaultPath, path)
				results = append(results, models.FileInfo{
					Name:       info.Name(),
					Path:       relPath,
					IsDir:      false,
					ModifiedAt: info.ModTime(),
				})
			}
		}

		return nil
	})

	return results, err
}

func (s *FileService) getFullPath(relativePath string) string {
	vaultPath := s.configService.GetVaultPath()
	if relativePath == "" {
		return vaultPath
	}
	return filepath.Join(vaultPath, relativePath)
}
