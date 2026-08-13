package services

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/kazuph/obails/models"
)

// Image file extensions
var imageExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
	".webp": true, ".svg": true, ".bmp": true, ".ico": true,
}

var audioExtensions = map[string]bool{
	".mp3": true, ".m4a": true, ".wav": true, ".ogg": true,
	".flac": true, ".aac": true, ".opus": true,
}

var ErrInvalidPath = errors.New("invalid vault path")

// GetFileType determines the file type based on extension
func GetFileType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch {
	case ext == ".md":
		return models.FileTypeMarkdown
	case ext == ".pdf":
		return models.FileTypePDF
	case ext == ".html" || ext == ".htm":
		return models.FileTypeHTML
	case ext == ".txt":
		return models.FileTypeText
	case imageExtensions[ext]:
		return models.FileTypeImage
	case audioExtensions[ext]:
		return models.FileTypeAudio
	default:
		return models.FileTypeOther
	}
}

// FileService handles file system operations
type FileService struct {
	configService    *ConfigService
	writeMu          sync.Mutex
	afterDeleteStage func()
}

type deleteTargetStage struct {
	sourcePath string
	stagedPath string
	stagingDir string
}

// NewFileService creates a new FileService
func NewFileService(configService *ConfigService) *FileService {
	return &FileService{
		configService: configService,
	}
}

// ReadFile reads the content of a file
func (s *FileService) ReadFile(relativePath string) (string, error) {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return "", err
	}
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// ReadSnapshot returns the path, content, and revision required for a CAS save.
func (s *FileService) ReadSnapshot(relativePath string) (models.FileSnapshot, error) {
	cleanPath, err := s.cleanRelativePath(relativePath, false)
	if err != nil {
		return models.FileSnapshot{}, err
	}
	fullPath, err := s.resolveFullPath(cleanPath, false)
	if err != nil {
		return models.FileSnapshot{}, err
	}
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return models.FileSnapshot{}, err
	}

	text := string(content)
	return models.FileSnapshot{
		Path:     cleanPath,
		Content:  text,
		Revision: revisionForContent(text),
	}, nil
}

// WriteFile writes content to a file
func (s *FileService) WriteFile(relativePath string, content string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.writeFile(relativePath, content)
}

func (s *FileService) writeFile(relativePath string, content string) error {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return err
	}

	// Ensure directory exists
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(fullPath, []byte(content), 0644)
}

// SaveIfUnchanged saves content only when the existing file still matches
// snapshot. It intentionally neither creates directories nor recreates a
// missing path.
func (s *FileService) SaveIfUnchanged(snapshot models.FileSnapshot, content string) (models.FileSaveResult, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.saveIfUnchanged(snapshot, content)
}

func (s *FileService) saveIfUnchanged(snapshot models.FileSnapshot, content string) (models.FileSaveResult, error) {
	cleanPath, err := s.cleanRelativePath(snapshot.Path, false)
	if err != nil {
		return models.FileSaveResult{}, err
	}
	if cleanPath != snapshot.Path || revisionForContent(snapshot.Content) != snapshot.Revision {
		return models.FileSaveResult{Status: models.FileSaveStatusConflict}, nil
	}

	fullPath, err := s.resolveFullPath(cleanPath, false)
	if err != nil {
		return models.FileSaveResult{}, err
	}
	file, err := os.OpenFile(fullPath, os.O_RDWR, 0)
	if errors.Is(err, os.ErrNotExist) {
		return models.FileSaveResult{Status: models.FileSaveStatusMissing}, nil
	}
	if err != nil {
		return models.FileSaveResult{}, err
	}
	defer file.Close()

	originalInfo, err := file.Stat()
	if err != nil {
		return models.FileSaveResult{}, err
	}
	currentBytes, err := io.ReadAll(file)
	if err != nil {
		return models.FileSaveResult{}, err
	}
	current := string(currentBytes)
	currentSnapshot := models.FileSnapshot{
		Path:     cleanPath,
		Content:  current,
		Revision: revisionForContent(current),
	}
	if current != snapshot.Content || currentSnapshot.Revision != snapshot.Revision {
		return models.FileSaveResult{
			Status:   models.FileSaveStatusConflict,
			Snapshot: &currentSnapshot,
		}, nil
	}

	temporaryFile, err := os.CreateTemp(filepath.Dir(fullPath), ".obails-cas-*")
	if err != nil {
		return models.FileSaveResult{}, err
	}
	temporaryPath := temporaryFile.Name()
	defer os.Remove(temporaryPath)
	if err := temporaryFile.Chmod(originalInfo.Mode().Perm()); err != nil {
		temporaryFile.Close()
		return models.FileSaveResult{}, err
	}
	if written, err := io.WriteString(temporaryFile, content); err != nil {
		temporaryFile.Close()
		return models.FileSaveResult{}, err
	} else if written != len(content) {
		temporaryFile.Close()
		return models.FileSaveResult{}, io.ErrShortWrite
	}
	if err := temporaryFile.Sync(); err != nil {
		temporaryFile.Close()
		return models.FileSaveResult{}, err
	}
	if err := temporaryFile.Close(); err != nil {
		return models.FileSaveResult{}, err
	}

	finalPath, err := s.resolveFullPath(cleanPath, false)
	if err != nil {
		return models.FileSaveResult{}, err
	}
	finalInfo, err := os.Stat(finalPath)
	if errors.Is(err, os.ErrNotExist) {
		return models.FileSaveResult{Status: models.FileSaveStatusMissing}, nil
	}
	if err != nil {
		return models.FileSaveResult{}, err
	}
	finalBytes, err := os.ReadFile(finalPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return models.FileSaveResult{Status: models.FileSaveStatusMissing}, nil
		}
		return models.FileSaveResult{}, err
	}
	stableInfo, err := os.Stat(finalPath)
	if errors.Is(err, os.ErrNotExist) {
		return models.FileSaveResult{Status: models.FileSaveStatusMissing}, nil
	}
	if err != nil {
		return models.FileSaveResult{}, err
	}
	finalContent := string(finalBytes)
	if !os.SameFile(originalInfo, finalInfo) || !os.SameFile(originalInfo, stableInfo) || finalContent != snapshot.Content || revisionForContent(finalContent) != snapshot.Revision {
		return models.FileSaveResult{
			Status: models.FileSaveStatusConflict,
			Snapshot: &models.FileSnapshot{
				Path:     cleanPath,
				Content:  finalContent,
				Revision: revisionForContent(finalContent),
			},
		}, nil
	}
	if err := os.Rename(temporaryPath, finalPath); err != nil {
		return models.FileSaveResult{}, err
	}

	updated := models.FileSnapshot{
		Path:     cleanPath,
		Content:  content,
		Revision: revisionForContent(content),
	}
	return models.FileSaveResult{
		Status:   models.FileSaveStatusSaved,
		Snapshot: &updated,
	}, nil
}

func revisionForContent(content string) string {
	sum := sha256.Sum256([]byte(content))
	return fmt.Sprintf("%x", sum)
}

// CreateFile creates a new file with content (fails if file exists)
func (s *FileService) CreateFile(relativePath string, content string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return err
	}

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

// DeletePath permanently removes a file or directory. User-facing deletion
// must call Delete so the configured destination is respected.
//
//wails:ignore
func (s *FileService) DeletePath(relativePath string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.deletePath(relativePath)
}

func (s *FileService) deletePath(relativePath string) error {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return err
	}

	// Check if path exists
	info, err := os.Stat(fullPath)
	if err != nil {
		return err
	}

	if info.IsDir() {
		return os.RemoveAll(fullPath)
	}
	return os.Remove(fullPath)
}

// Delete sends a path to the configured deletion destination.
func (s *FileService) Delete(relativePath string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	mode := s.configService.GetDeleteMode()
	if !mode.IsValid() {
		return fmt.Errorf("invalid delete mode: %q", mode)
	}
	cleanPath, err := s.cleanRelativePath(relativePath, false)
	if err != nil {
		return err
	}
	sourcePath, err := s.resolveFullPath(cleanPath, false)
	if err != nil {
		return err
	}
	target, err := stageDeleteTarget(sourcePath)
	if err != nil {
		return err
	}
	cleanupTarget := false
	defer func() {
		if cleanupTarget {
			_ = os.RemoveAll(target.stagingDir)
		}
	}()
	if s.afterDeleteStage != nil {
		s.afterDeleteStage()
	}

	recoveryStage, err := s.stageRecentlyDeleted(cleanPath, target.stagedPath, mode)
	if err != nil {
		if rollbackErr := rollbackStagedDelete(target); rollbackErr != nil {
			return fmt.Errorf("could not stage recovery record: %w; could not restore original inode: %v", err, rollbackErr)
		}
		cleanupTarget = true
		return err
	}
	if err := s.finalizeRecentlyDeleted(recoveryStage); err != nil {
		if rollbackErr := rollbackStagedDelete(target); rollbackErr != nil {
			return fmt.Errorf("could not publish recovery record: %w; could not restore original inode: %v", err, rollbackErr)
		}
		cleanupTarget = true
		if removeErr := os.RemoveAll(recoveryStage.staging); removeErr != nil {
			return fmt.Errorf("could not publish recovery record: %w; restored source but could not clear staged record: %v", err, removeErr)
		}
		return err
	}

	switch mode {
	case models.DeleteModeSystemTrash:
		err = trashFullPath(target.stagedPath)
	case models.DeleteModeVaultTrash:
		err = s.movePathToVaultTrash(target.stagedPath, cleanPath)
	case models.DeleteModePermanent:
		err = deleteFullPath(target.stagedPath)
	}
	if err != nil {
		if rollbackErr := rollbackStagedDelete(target); rollbackErr != nil {
			cleanupTarget = true
			return fmt.Errorf("delete failed: %w; recovery record remains because the original path was replaced or rollback failed: %v", err, rollbackErr)
		}
		cleanupTarget = true
		if removeErr := os.RemoveAll(recoveryStage.destination); removeErr != nil {
			return fmt.Errorf("delete failed: %w; restored source but could not clear recovery record: %v", err, removeErr)
		}
		return err
	}
	cleanupTarget = true
	return nil
}

func stageDeleteTarget(sourcePath string) (deleteTargetStage, error) {
	info, err := os.Lstat(sourcePath)
	if err != nil {
		return deleteTargetStage{}, err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return deleteTargetStage{}, ErrInvalidPath
	}
	stagingDir, err := os.MkdirTemp(filepath.Dir(sourcePath), ".obails-delete-")
	if err != nil {
		return deleteTargetStage{}, err
	}
	stagedPath := filepath.Join(stagingDir, filepath.Base(sourcePath))
	if err := os.Rename(sourcePath, stagedPath); err != nil {
		_ = os.RemoveAll(stagingDir)
		return deleteTargetStage{}, err
	}
	return deleteTargetStage{sourcePath: sourcePath, stagedPath: stagedPath, stagingDir: stagingDir}, nil
}

func rollbackStagedDelete(target deleteTargetStage) error {
	if _, err := os.Lstat(target.sourcePath); err == nil {
		return os.ErrExist
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return os.Rename(target.stagedPath, target.sourcePath)
}

// TrashPath moves a file or directory to the macOS Trash using the configured
// trash command. It never falls back to permanent deletion.
//
//wails:ignore
func (s *FileService) TrashPath(relativePath string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.trashPath(relativePath)
}

func (s *FileService) trashPath(relativePath string) error {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return err
	}
	return trashFullPath(fullPath)
}

func trashFullPath(fullPath string) error {
	if _, err := os.Stat(fullPath); err != nil {
		return err
	}
	if _, err := exec.LookPath("trash"); err != nil {
		return fmt.Errorf("trash command not found; install trash or use --force for permanent delete: %w", err)
	}

	output, err := exec.Command("trash", fullPath).CombinedOutput()
	if err != nil {
		detail := strings.TrimSpace(string(output))
		if detail != "" {
			return fmt.Errorf("failed to move to trash: %w: %s", err, detail)
		}
		return fmt.Errorf("failed to move to trash: %w", err)
	}
	return nil
}

// MoveToVaultTrash moves a path beneath the vault-local .trash directory.
//
//wails:ignore
func (s *FileService) MoveToVaultTrash(relativePath string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.moveToVaultTrash(relativePath)
}

func (s *FileService) moveToVaultTrash(relativePath string) error {
	cleanPath, err := s.cleanRelativePath(relativePath, false)
	if err != nil {
		return err
	}
	sourcePath, err := s.resolveFullPath(cleanPath, false)
	if err != nil {
		return err
	}
	return s.movePathToVaultTrash(sourcePath, cleanPath)
}

func (s *FileService) movePathToVaultTrash(sourcePath string, cleanPath string) error {
	trashPath := filepath.ToSlash(filepath.Join(".trash", filepath.FromSlash(cleanPath)))
	destinationPath, err := s.resolveFullPath(trashPath, false)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(destinationPath); err == nil {
		return os.ErrExist
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(destinationPath), 0755); err != nil {
		return err
	}
	return os.Rename(sourcePath, destinationPath)
}

func deleteFullPath(fullPath string) error {
	info, err := os.Lstat(fullPath)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return os.RemoveAll(fullPath)
	}
	return os.Remove(fullPath)
}

// MoveFile moves a file from one location to another
func (s *FileService) MoveFile(sourcePath string, destPath string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	cleanSourcePath, err := s.cleanRelativePath(sourcePath, false)
	if err != nil {
		return err
	}
	cleanDestPath, err := s.cleanRelativePath(destPath, false)
	if err != nil {
		return err
	}
	sourceFullPath, err := s.resolveFullPath(cleanSourcePath, false)
	if err != nil {
		return err
	}
	destFullPath, err := s.resolveFullPath(cleanDestPath, false)
	if err != nil {
		return err
	}

	sourceInfo, err := os.Stat(sourceFullPath)
	if err != nil {
		return err
	}

	if sourceInfo.IsDir() && pathIsWithinAncestor(cleanDestPath, cleanSourcePath) {
		return errors.New("cannot move directory into itself or descendant")
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

	rewrites, err := prepareLinkRewritesForMove(s.configService.GetVaultPath(), cleanSourcePath, cleanDestPath, sourceInfo.IsDir())
	if err != nil {
		return err
	}
	if err := os.Rename(sourceFullPath, destFullPath); err != nil {
		return err
	}
	for originalPath, content := range rewrites {
		movedPath := movedVaultPath(originalPath, cleanSourcePath, cleanDestPath, sourceInfo.IsDir())
		if err := s.writeFile(movedPath, content); err != nil {
			return err
		}
	}
	return nil
}

// ListDirectory lists files and directories
func (s *FileService) ListDirectory(relativePath string) ([]models.FileInfo, error) {
	cleanPath, err := s.cleanRelativePath(relativePath, true)
	if err != nil {
		return nil, err
	}
	fullPath, err := s.resolveFullPath(cleanPath, true)
	if err != nil {
		return nil, err
	}
	return s.listDirectoryRecursive(fullPath, cleanPath, 1)
}

// ListDirectoryTree lists the entire directory tree
func (s *FileService) ListDirectoryTree() ([]models.FileInfo, error) {
	vaultPath := s.configService.GetVaultPath()
	return s.listDirectoryRecursive(vaultPath, "", -1)
}

func (s *FileService) listDirectoryRecursive(fullPath string, relativePath string, maxDepth int) ([]models.FileInfo, error) {
	if maxDepth == 0 {
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
			FileType:   GetFileType(entry.Name()),
			ModifiedAt: info.ModTime(),
			CreatedAt:  creationTime(info),
		}
		if entry.IsDir() {
			fileInfo.FileType = "" // Directories don't have a file type
		}

		if entry.IsDir() && maxDepth != 1 {
			nextDepth := maxDepth
			if nextDepth > 0 {
				nextDepth--
			}
			children, err := s.listDirectoryRecursive(
				filepath.Join(fullPath, entry.Name()),
				entryRelPath,
				nextDepth,
			)
			if err == nil {
				fileInfo.Children = children
			}
		}

		result = append(result, fileInfo)
	}

	return result, nil
}

// CreateDirectory creates a new directory
func (s *FileService) CreateDirectory(relativePath string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return err
	}

	parentDir := filepath.Dir(fullPath)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		return err
	}

	return os.Mkdir(fullPath, 0755)
}

// DeleteFile deletes a file or empty directory
//
//wails:ignore
func (s *FileService) DeleteFile(relativePath string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return err
	}
	return os.Remove(fullPath)
}

// FileExists checks if a file exists
func (s *FileService) FileExists(relativePath string) bool {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return false
	}
	_, err = os.Stat(fullPath)
	return err == nil
}

// GetFileInfo returns information about a file
func (s *FileService) GetFileInfo(relativePath string) (*models.FileInfo, error) {
	cleanPath, err := s.cleanRelativePath(relativePath, false)
	if err != nil {
		return nil, err
	}
	fullPath, err := s.resolveFullPath(cleanPath, false)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(fullPath)
	if err != nil {
		return nil, err
	}

	return &models.FileInfo{
		Name:       filepath.Base(cleanPath),
		Path:       cleanPath,
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

// SearchFileContents searches for a query string within the content of all markdown files in the vault.
// It returns matching lines with their file path, line number, and context.
func (s *FileService) SearchFileContents(query string, limit int, caseSensitive bool) ([]models.SearchResult, error) {
	vaultPath := s.configService.GetVaultPath()
	var results []models.SearchResult

	filepath.Walk(vaultPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			if info != nil && info.IsDir() && strings.HasPrefix(info.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(info.Name(), ".") {
			return nil
		}
		if !strings.HasSuffix(info.Name(), ".md") {
			return nil
		}

		content, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		text := string(content)
		searchText := text
		searchQuery := query
		if !caseSensitive {
			searchText = strings.ToLower(text)
			searchQuery = strings.ToLower(query)
		}

		lines := strings.Split(text, "\n")
		searchLines := strings.Split(searchText, "\n")

		relPath, _ := filepath.Rel(vaultPath, path)
		for i, line := range searchLines {
			if strings.Contains(line, searchQuery) {
				// Extract context (the matching line, trimmed)
				context := strings.TrimSpace(lines[i])
				if len(context) > 200 {
					context = context[:200] + "..."
				}

				title := strings.TrimSuffix(info.Name(), ".md")
				results = append(results, models.SearchResult{
					Path:    relPath,
					Title:   title,
					Line:    i + 1,
					Context: context,
				})

				if limit > 0 && len(results) >= limit {
					return filepath.SkipAll
				}
			}
		}
		return nil
	})

	return results, nil
}

func (s *FileService) resolveFullPath(relativePath string, allowRoot bool) (string, error) {
	cleanPath, err := s.cleanRelativePath(relativePath, allowRoot)
	if err != nil {
		return "", err
	}

	vaultPath, err := filepath.EvalSymlinks(s.configService.GetVaultPath())
	if err != nil {
		return "", err
	}
	vaultPath, err = filepath.Abs(vaultPath)
	if err != nil {
		return "", err
	}
	if cleanPath == "" {
		return vaultPath, nil
	}

	fullPath := filepath.Join(vaultPath, filepath.FromSlash(cleanPath))
	if err := ensurePathWithinVault(vaultPath, fullPath); err != nil {
		return "", err
	}
	return fullPath, nil
}

func (s *FileService) cleanRelativePath(relativePath string, allowRoot bool) (string, error) {
	if relativePath == "" {
		if allowRoot {
			return "", nil
		}
		return "", ErrInvalidPath
	}

	if filepath.IsAbs(relativePath) {
		return "", ErrInvalidPath
	}

	cleaned := filepath.ToSlash(filepath.Clean(filepath.FromSlash(relativePath)))
	if cleaned != relativePath {
		return "", ErrInvalidPath
	}
	if cleaned == "." {
		if allowRoot {
			return "", nil
		}
		return "", ErrInvalidPath
	}

	if cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", ErrInvalidPath
	}

	return cleaned, nil
}

func ensurePathWithinVault(vaultPath string, fullPath string) error {
	for existingPath := fullPath; ; existingPath = filepath.Dir(existingPath) {
		_, err := os.Lstat(existingPath)
		if err == nil {
			realPath, err := filepath.EvalSymlinks(existingPath)
			if err != nil || !isWithinVault(vaultPath, realPath) {
				return ErrInvalidPath
			}
			return nil
		}
		if !errors.Is(err, os.ErrNotExist) || existingPath == vaultPath {
			return err
		}
	}
}

func isWithinVault(vaultPath string, path string) bool {
	relativePath, err := filepath.Rel(vaultPath, path)
	if err != nil {
		return false
	}
	return relativePath != ".." && !strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) && !filepath.IsAbs(relativePath)
}

// ReadBinaryFile reads a binary file and returns it as base64 encoded string
// Used for images and PDFs that need to be displayed in the frontend
func (s *FileService) ReadBinaryFile(relativePath string) (string, error) {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return "", err
	}
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(content), nil
}

// ServeMedia streams vault audio files with HTTP range support.
func (s *FileService) ServeMedia(w http.ResponseWriter, r *http.Request) bool {
	if r.URL.Path != "/media/audio" {
		return false
	}

	relativePath := r.URL.Query().Get("path")
	if GetFileType(relativePath) != models.FileTypeAudio {
		http.Error(w, "unsupported media type", http.StatusUnsupportedMediaType)
		return true
	}

	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		http.Error(w, "invalid media path", http.StatusBadRequest)
		return true
	}

	file, err := os.Open(fullPath)
	if err != nil {
		http.Error(w, "media not found", http.StatusNotFound)
		return true
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil || info.IsDir() {
		http.Error(w, "media not found", http.StatusNotFound)
		return true
	}

	w.Header().Set("Content-Type", GetMimeType(relativePath))
	w.Header().Set("Accept-Ranges", "bytes")
	http.ServeContent(w, r, filepath.Base(relativePath), info.ModTime(), file)
	return true
}

// GetMimeType returns the MIME type for a file based on extension
func GetMimeType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	mimeTypes := map[string]string{
		".png":  "image/png",
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".gif":  "image/gif",
		".webp": "image/webp",
		".svg":  "image/svg+xml",
		".bmp":  "image/bmp",
		".ico":  "image/x-icon",
		".pdf":  "application/pdf",
		".html": "text/html",
		".htm":  "text/html",
		".mp3":  "audio/mpeg",
		".m4a":  "audio/mp4",
		".wav":  "audio/wav",
		".ogg":  "audio/ogg",
		".flac": "audio/flac",
		".aac":  "audio/aac",
		".opus": "audio/ogg",
	}
	if mime, ok := mimeTypes[ext]; ok {
		return mime
	}
	return "application/octet-stream"
}

// ResolveImagePath resolves an image path relative to the current note or vault root.
// It tries: 1) note-relative path, 2) vault-relative path, 3) filename-only search in vault root.
// Returns the vault-relative path of the found image, or an error if not found.
func (s *FileService) ResolveImagePath(imagePath string, notePath string) (string, error) {
	vaultPath := s.configService.GetVaultPath()

	// Candidates to try
	var candidates []string

	// 1. Relative to the note's directory
	if notePath != "" {
		noteDir := filepath.Dir(notePath)
		if noteDir != "." {
			candidates = append(candidates, filepath.Join(noteDir, imagePath))
		}
	}

	// 2. Vault-relative (as-is)
	candidates = append(candidates, imagePath)

	// 3. If just a filename, also check common attachment folders
	if !strings.Contains(imagePath, "/") && !strings.Contains(imagePath, string(filepath.Separator)) {
		// Try common Obsidian attachment folder names
		for _, folder := range []string{"attachments", "assets", "images", "img", "media"} {
			candidates = append(candidates, filepath.Join(folder, imagePath))
		}
	}

	for _, candidate := range candidates {
		clean := filepath.Clean(filepath.FromSlash(candidate))
		if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
			continue
		}
		fullPath := filepath.Join(vaultPath, clean)
		if _, err := os.Stat(fullPath); err == nil {
			return filepath.ToSlash(clean), nil
		}
	}

	// 4. Obsidian resolves bare filenames anywhere in the vault — walk as a last resort.
	if base := filepath.Base(filepath.FromSlash(imagePath)); base == filepath.FromSlash(imagePath) {
		if found, err := s.findFileByName(vaultPath, base); err == nil && found != "" {
			return found, nil
		}
	}

	return "", errors.New("image not found: " + imagePath)
}

// findFileByName walks the vault looking for the first file whose name matches exactly.
// Hidden directories (e.g. .obsidian, .git) are skipped.
func (s *FileService) findFileByName(vaultPath, name string) (string, error) {
	var found string
	err := filepath.WalkDir(vaultPath, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if path != vaultPath && strings.HasPrefix(d.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Name() == name {
			rel, relErr := filepath.Rel(vaultPath, path)
			if relErr != nil {
				return nil
			}
			found = filepath.ToSlash(rel)
			return filepath.SkipAll
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return found, nil
}

// ImportExternalFile copies a file from an absolute path on disk into the vault.
// It refuses name collisions so callers can show a recovery choice; it never
// rewrites an existing vault file.
func (s *FileService) ImportExternalFile(sourceAbsolutePath string, targetFolder string) (string, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	sourceAbsolutePath = strings.TrimSpace(sourceAbsolutePath)
	if sourceAbsolutePath == "" {
		return "", errors.New("source path is required")
	}
	if !filepath.IsAbs(sourceAbsolutePath) {
		return "", errors.New("source path must be absolute")
	}

	sourceInfo, err := os.Stat(sourceAbsolutePath)
	if err != nil {
		return "", err
	}
	if sourceInfo.IsDir() {
		return "", errors.New("directories are not supported")
	}

	destRelativePath, err := s.importDestinationPath(targetFolder, filepath.Base(sourceAbsolutePath))
	if err != nil {
		return "", err
	}

	destFullPath, err := s.resolveFullPath(destRelativePath, false)
	if err != nil {
		return "", err
	}

	if err := copyExternalFile(sourceAbsolutePath, destFullPath); err != nil {
		return "", err
	}

	return destRelativePath, nil
}

// ImportAttachment copies an external file to the configured destination for
// notePath and returns the vault-relative destination plus its Wiki embed.
func (s *FileService) ImportAttachment(sourceAbsolutePath, notePath string) (models.AttachmentImportResult, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.importAttachment(sourceAbsolutePath, notePath)
}

func (s *FileService) importAttachment(sourceAbsolutePath, notePath string) (models.AttachmentImportResult, error) {
	sourceAbsolutePath = strings.TrimSpace(sourceAbsolutePath)
	if sourceAbsolutePath == "" || !filepath.IsAbs(sourceAbsolutePath) {
		return models.AttachmentImportResult{}, errors.New("source path must be absolute")
	}
	sourceInfo, err := os.Stat(sourceAbsolutePath)
	if err != nil {
		return models.AttachmentImportResult{}, err
	}
	if !sourceInfo.Mode().IsRegular() {
		return models.AttachmentImportResult{}, errors.New("source path must be a regular file")
	}

	cleanNotePath, err := s.cleanRelativePath(notePath, false)
	if err != nil {
		return models.AttachmentImportResult{}, err
	}
	if !isMarkdownNotePath(cleanNotePath) {
		return models.AttachmentImportResult{}, errors.New("attachment target must be a Markdown note")
	}
	noteFullPath, err := s.resolveFullPath(cleanNotePath, false)
	if err != nil {
		return models.AttachmentImportResult{}, err
	}
	noteInfo, err := os.Lstat(noteFullPath)
	if err != nil {
		return models.AttachmentImportResult{}, err
	}
	if !noteInfo.Mode().IsRegular() {
		return models.AttachmentImportResult{}, errors.New("attachment target must be a regular file")
	}

	attachmentConfig, err := s.configService.GetAttachmentConfig()
	if err != nil {
		return models.AttachmentImportResult{}, err
	}
	destinationFolder, err := s.attachmentDestinationFolder(attachmentConfig, cleanNotePath)
	if err != nil {
		return models.AttachmentImportResult{}, err
	}
	destinationPath, err := s.importDestinationPath(destinationFolder, filepath.Base(sourceAbsolutePath))
	if err != nil {
		return models.AttachmentImportResult{}, err
	}
	destinationFullPath, err := s.resolveFullPath(destinationPath, false)
	if err != nil {
		return models.AttachmentImportResult{}, err
	}
	if err := copyExternalFile(sourceAbsolutePath, destinationFullPath); err != nil {
		return models.AttachmentImportResult{}, err
	}
	return models.AttachmentImportResult{
		DestinationPath: destinationPath,
		Embed:           "![[" + encodeLinkPath(destinationPath) + "]]",
	}, nil
}

func isMarkdownNotePath(relativePath string) bool {
	switch strings.ToLower(filepath.Ext(relativePath)) {
	case ".md", ".markdown":
		return true
	default:
		return false
	}
}

func (s *FileService) attachmentDestinationFolder(config models.AttachmentConfig, notePath string) (string, error) {
	config, err := models.NormalizeAttachmentConfig(config)
	if err != nil {
		return "", err
	}
	switch config.Location {
	case models.AttachmentLocationVaultRoot:
		return "", nil
	case models.AttachmentLocationVaultFolder:
		return config.Folder, nil
	case models.AttachmentLocationCurrentFolder:
		return s.cleanRelativePath(filepath.ToSlash(filepath.Dir(filepath.FromSlash(notePath))), true)
	case models.AttachmentLocationCurrentSubfolder:
		return s.cleanRelativePath(filepath.ToSlash(filepath.Join(filepath.Dir(filepath.FromSlash(notePath)), filepath.FromSlash(config.Folder))), false)
	default:
		return "", errors.New("invalid attachment location")
	}
}

// IsExternalDirectory classifies an absolute drag source without granting it
// any vault-relative path semantics.
func (s *FileService) IsExternalDirectory(sourceAbsolutePath string) (bool, error) {
	if !filepath.IsAbs(sourceAbsolutePath) {
		return false, errors.New("source path must be absolute")
	}
	info, err := os.Stat(sourceAbsolutePath)
	if err != nil {
		return false, err
	}
	return info.IsDir(), nil
}

// ImportExternalFolder recursively imports a folder and reports every path
// collision. Non-colliding files are copied; existing vault content is never
// overwritten.
func (s *FileService) ImportExternalFolder(sourceAbsolutePath string, targetFolder string) ([]models.ImportOutcome, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	sourceAbsolutePath = strings.TrimSpace(sourceAbsolutePath)
	if sourceAbsolutePath == "" || !filepath.IsAbs(sourceAbsolutePath) {
		return nil, errors.New("source folder path must be absolute")
	}
	info, err := os.Stat(sourceAbsolutePath)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, errors.New("source path is not a directory")
	}
	baseDestination, err := s.importDestinationPath(targetFolder, filepath.Base(sourceAbsolutePath))
	if err != nil {
		return nil, err
	}
	if _, err := s.resolveFullPath(baseDestination, false); err != nil {
		return nil, err
	}

	outcomes := []models.ImportOutcome{}
	err = filepath.WalkDir(sourceAbsolutePath, func(sourcePath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if sourcePath == sourceAbsolutePath {
			return nil
		}
		relativeSourcePath, err := filepath.Rel(sourceAbsolutePath, sourcePath)
		if err != nil {
			return err
		}
		destinationRelativePath := filepath.ToSlash(filepath.Join(baseDestination, relativeSourcePath))
		destinationFullPath, err := s.resolveFullPath(destinationRelativePath, false)
		if err != nil {
			return err
		}
		if _, err := os.Lstat(destinationFullPath); err == nil {
			outcomes = append(outcomes, models.ImportOutcome{SourcePath: sourcePath, DestinationPath: destinationRelativePath, Status: models.ImportStatusCollision, IsDir: entry.IsDir()})
			if entry.IsDir() {
				return nil
			}
			return nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if entry.IsDir() {
			if err := os.MkdirAll(destinationFullPath, 0755); err != nil {
				return err
			}
			outcomes = append(outcomes, models.ImportOutcome{SourcePath: sourcePath, DestinationPath: destinationRelativePath, Status: models.ImportStatusImported, IsDir: true})
			return nil
		}
		if err := copyExternalFile(sourcePath, destinationFullPath); err != nil {
			return err
		}
		outcomes = append(outcomes, models.ImportOutcome{SourcePath: sourcePath, DestinationPath: destinationRelativePath, Status: models.ImportStatusImported})
		return nil
	})
	return outcomes, err
}

func pathIsWithinAncestor(descendantPath, ancestorPath string) bool {
	if ancestorPath == "" {
		return false
	}
	return descendantPath == ancestorPath || strings.HasPrefix(descendantPath, ancestorPath+"/")
}

func (s *FileService) importDestinationPath(targetFolder, fileName string) (string, error) {
	cleanFolder, err := s.cleanRelativePath(targetFolder, true)
	if err != nil {
		return "", err
	}
	if cleanFolder == "" {
		return s.cleanRelativePath(fileName, false)
	}
	return s.cleanRelativePath(filepath.ToSlash(filepath.Join(cleanFolder, fileName)), false)
}

func copyExternalFile(sourcePath, destinationPath string) error {
	if _, err := os.Lstat(destinationPath); err == nil {
		return os.ErrExist
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(destinationPath), 0755); err != nil {
		return err
	}
	sourceFile, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer sourceFile.Close()
	destFile, err := os.OpenFile(destinationPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	completed := false
	defer func() {
		if !completed {
			_ = os.Remove(destinationPath)
		}
	}()
	if _, err = io.Copy(destFile, sourceFile); err != nil {
		_ = destFile.Close()
		return err
	}
	if err = destFile.Sync(); err != nil {
		_ = destFile.Close()
		return err
	}
	if err = destFile.Close(); err != nil {
		return err
	}
	completed = true
	return nil
}

// RevealInFinder reveals a file or directory in Finder.
func (s *FileService) RevealInFinder(relativePath string) error {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return err
	}

	if _, err := os.Stat(fullPath); err != nil {
		return err
	}

	cmd := exec.Command("open", "-R", fullPath)
	return cmd.Start()
}

// OpenWithDefaultApp opens a file or directory with the OS default application (macOS open command).
func (s *FileService) OpenWithDefaultApp(relativePath string) error {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return err
	}

	if _, err := os.Stat(fullPath); err != nil {
		return err
	}

	cmd := exec.Command("open", fullPath)
	return cmd.Start()
}

// GetAbsolutePath returns the absolute filesystem path for a vault-relative path.
func (s *FileService) GetAbsolutePath(relativePath string) (string, error) {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return "", err
	}

	if _, err := os.Stat(fullPath); err != nil {
		return "", err
	}

	return fullPath, nil
}

func (s *FileService) uniqueRelativePath(targetFolder, fileName string) (string, error) {
	fileName = strings.TrimSpace(fileName)
	if fileName == "" || fileName == "." || fileName == ".." {
		return "", errors.New("invalid file name")
	}

	ext := filepath.Ext(fileName)
	nameWithoutExt := strings.TrimSuffix(fileName, ext)

	candidate := fileName
	for i := 0; ; i++ {
		if i > 0 {
			candidate = fmt.Sprintf("%s (%d)%s", nameWithoutExt, i, ext)
		}

		relativePath := candidate
		if targetFolder != "" {
			relativePath = filepath.ToSlash(filepath.Join(filepath.FromSlash(targetFolder), candidate))
		}

		exists, err := s.pathExists(relativePath)
		if err != nil {
			return "", err
		}
		if !exists {
			return relativePath, nil
		}
	}
}

func (s *FileService) pathExists(relativePath string) (bool, error) {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return false, err
	}
	_, err = os.Stat(fullPath)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

// OpenExternal opens a file with the system's default application
// Uses macOS 'open' command
func (s *FileService) OpenExternal(relativePath string) error {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return err
	}

	// Verify the file exists
	if _, err := os.Stat(fullPath); err != nil {
		return err
	}

	// Use macOS open command
	cmd := exec.Command("open", fullPath)
	return cmd.Start()
}

// OpenURL opens a URL in the system's default browser
// Uses macOS 'open' command
func (s *FileService) OpenURL(url string) error {
	// Use macOS open command to open URL in default browser
	cmd := exec.Command("open", url)
	return cmd.Start()
}
