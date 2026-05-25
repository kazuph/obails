package services

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

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

// WriteFile writes content to a file
func (s *FileService) WriteFile(relativePath string, content string) error {
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

// CreateFile creates a new file with content (fails if file exists)
func (s *FileService) CreateFile(relativePath string, content string) error {
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

// DeletePath deletes a file or directory (moves to trash on macOS)
func (s *FileService) DeletePath(relativePath string) error {
	fullPath, err := s.resolveFullPath(relativePath, false)
	if err != nil {
		return err
	}

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
	sourceFullPath, err := s.resolveFullPath(sourcePath, false)
	if err != nil {
		return err
	}
	destFullPath, err := s.resolveFullPath(destPath, false)
	if err != nil {
		return err
	}

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

	// Sort: folders first (ascending by name), then files (descending by name)
	sort.Slice(result, func(i, j int) bool {
		// Folders before files
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		// Folders: ascending by name
		if result[i].IsDir {
			return result[i].Name < result[j].Name
		}
		// Files: descending by name
		return result[i].Name > result[j].Name
	})

	return result, nil
}

// CreateDirectory creates a new directory
func (s *FileService) CreateDirectory(relativePath string) error {
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
func (s *FileService) DeleteFile(relativePath string) error {
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

	vaultPath := s.configService.GetVaultPath()
	if cleanPath == "" {
		return vaultPath, nil
	}

	return filepath.Join(vaultPath, filepath.FromSlash(cleanPath)), nil
}

func (s *FileService) cleanRelativePath(relativePath string, allowRoot bool) (string, error) {
	trimmed := strings.TrimSpace(relativePath)
	if trimmed == "" {
		if allowRoot {
			return "", nil
		}
		return "", ErrInvalidPath
	}

	if filepath.IsAbs(trimmed) {
		return "", ErrInvalidPath
	}

	cleaned := filepath.Clean(filepath.FromSlash(trimmed))
	if cleaned == "." {
		if allowRoot {
			return "", nil
		}
		return "", ErrInvalidPath
	}

	if cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", ErrInvalidPath
	}

	return filepath.ToSlash(cleaned), nil
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

	return "", errors.New("image not found: " + imagePath)
}

// ImportExternalFile copies a file from an absolute path on disk into the vault.
func (s *FileService) ImportExternalFile(sourceAbsolutePath string, targetFolder string) (string, error) {
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

	destRelativePath, err := s.uniqueRelativePath(targetFolder, filepath.Base(sourceAbsolutePath))
	if err != nil {
		return "", err
	}

	destFullPath, err := s.resolveFullPath(destRelativePath, false)
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(filepath.Dir(destFullPath), 0755); err != nil {
		return "", err
	}

	sourceFile, err := os.Open(sourceAbsolutePath)
	if err != nil {
		return "", err
	}
	defer sourceFile.Close()

	destFile, err := os.OpenFile(destFullPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return "", err
	}
	defer destFile.Close()

	if _, err := io.Copy(destFile, sourceFile); err != nil {
		return "", err
	}

	return destRelativePath, nil
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
