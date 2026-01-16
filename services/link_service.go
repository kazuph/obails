package services

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/kazuph/obails/models"
)

// LinkService handles wiki-link parsing and backlink indexing
type LinkService struct {
	fileService   *FileService
	configService *ConfigService

	// Link index: file path -> links found in that file
	forwardIndex map[string][]string
	// Backlink index: file path -> files that link to it
	backwardIndex map[string][]string

	mu sync.RWMutex
}

// NewLinkService creates a new LinkService
func NewLinkService(fileService *FileService, configService *ConfigService) *LinkService {
	return &LinkService{
		fileService:   fileService,
		configService: configService,
		forwardIndex:  make(map[string][]string),
		backwardIndex: make(map[string][]string),
	}
}

// ParseLinks extracts all wiki-style links from content
func (s *LinkService) ParseLinks(content string) []string {
	// Match [[link]] or [[link|alias]]
	linkRegex := regexp.MustCompile(`\[\[([^\]|]+)(?:\|[^\]]+)?\]\]`)
	matches := linkRegex.FindAllStringSubmatch(content, -1)

	var links []string
	seen := make(map[string]bool)

	for _, match := range matches {
		if len(match) >= 2 {
			link := strings.TrimSpace(match[1])
			// Remove heading reference if present
			if idx := strings.Index(link, "#"); idx != -1 {
				link = link[:idx]
			}
			if link != "" && !seen[link] {
				links = append(links, link)
				seen[link] = true
			}
		}
	}

	return links
}

// ResolveLink resolves a link text to a file path
func (s *LinkService) ResolveLink(linkText string) (string, bool) {
	vaultPath := s.configService.GetVaultPath()

	// Try exact match with .md extension
	exactPath := linkText
	if !strings.HasSuffix(exactPath, ".md") {
		exactPath += ".md"
	}

	fullPath := filepath.Join(vaultPath, exactPath)
	if _, err := os.Stat(fullPath); err == nil {
		return exactPath, true
	}

	// Search for file by name in the vault
	var foundPath string
	filepath.Walk(vaultPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		// Skip hidden files
		if strings.HasPrefix(info.Name(), ".") {
			return nil
		}

		// Match by filename (without extension)
		nameWithoutExt := strings.TrimSuffix(info.Name(), ".md")
		if nameWithoutExt == linkText {
			foundPath, _ = filepath.Rel(vaultPath, path)
			return filepath.SkipAll
		}

		return nil
	})

	if foundPath != "" {
		return foundPath, true
	}

	return "", false
}

// GetBacklinks returns all files that link to the given file
func (s *LinkService) GetBacklinks(relativePath string) []models.Backlink {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Get the base name for matching
	baseName := strings.TrimSuffix(filepath.Base(relativePath), ".md")

	var backlinks []models.Backlink
	seen := make(map[string]bool)

	// Check files that link to this path or base name
	checkKeys := []string{relativePath, baseName}
	for _, key := range checkKeys {
		for _, sourcePath := range s.backwardIndex[key] {
			if seen[sourcePath] {
				continue
			}
			seen[sourcePath] = true

			sourceTitle := strings.TrimSuffix(filepath.Base(sourcePath), ".md")
			context := s.getBacklinkContext(sourcePath, baseName)

			backlinks = append(backlinks, models.Backlink{
				SourcePath:  sourcePath,
				SourceTitle: sourceTitle,
				Context:     context,
			})
		}
	}

	return backlinks
}

// RebuildIndex rebuilds the entire link index
func (s *LinkService) RebuildIndex() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Clear existing indices
	s.forwardIndex = make(map[string][]string)
	s.backwardIndex = make(map[string][]string)

	vaultPath := s.configService.GetVaultPath()
	if vaultPath == "" {
		return nil
	}

	return filepath.Walk(vaultPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors
		}

		// Skip directories and hidden files
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}

		if strings.HasPrefix(info.Name(), ".") {
			return nil
		}

		// Only process markdown files
		if !strings.HasSuffix(info.Name(), ".md") {
			return nil
		}

		relativePath, _ := filepath.Rel(vaultPath, path)

		// Read file content
		content, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		// Parse links
		links := s.ParseLinks(string(content))
		s.forwardIndex[relativePath] = links

		// Build backward index
		baseName := strings.TrimSuffix(info.Name(), ".md")
		for _, link := range links {
			s.backwardIndex[link] = append(s.backwardIndex[link], relativePath)
			// Also index by resolved path if different
			if resolved, ok := s.resolveWithoutLock(link); ok && resolved != link {
				s.backwardIndex[resolved] = append(s.backwardIndex[resolved], relativePath)
			}
		}

		// Also index by base name
		_ = baseName

		return nil
	})
}

// GetLinkInfo returns information about links in a file
func (s *LinkService) GetLinkInfo(relativePath string) ([]models.Link, error) {
	content, err := s.fileService.ReadFile(relativePath)
	if err != nil {
		return nil, err
	}

	linkTexts := s.ParseLinks(content)
	var links []models.Link

	for _, text := range linkTexts {
		targetPath, exists := s.ResolveLink(text)
		links = append(links, models.Link{
			Text:       text,
			TargetPath: targetPath,
			Exists:     exists,
		})
	}

	return links, nil
}

// GetIndexStats returns statistics about the link index
func (s *LinkService) GetIndexStats() map[string]int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return map[string]int{
		"totalFiles": len(s.forwardIndex),
		"totalLinks": s.countTotalLinks(),
	}
}

func (s *LinkService) countTotalLinks() int {
	total := 0
	for _, links := range s.forwardIndex {
		total += len(links)
	}
	return total
}

func (s *LinkService) resolveWithoutLock(linkText string) (string, bool) {
	vaultPath := s.configService.GetVaultPath()

	exactPath := linkText
	if !strings.HasSuffix(exactPath, ".md") {
		exactPath += ".md"
	}

	fullPath := filepath.Join(vaultPath, exactPath)
	if _, err := os.Stat(fullPath); err == nil {
		return exactPath, true
	}

	return "", false
}

func (s *LinkService) getBacklinkContext(sourcePath string, targetName string) string {
	content, err := s.fileService.ReadFile(sourcePath)
	if err != nil {
		return ""
	}

	lines := strings.Split(content, "\n")
	pattern := "[[" + targetName

	for _, line := range lines {
		if strings.Contains(line, pattern) {
			// Return a trimmed version of the line
			line = strings.TrimSpace(line)
			if len(line) > 100 {
				line = line[:100] + "..."
			}
			return line
		}
	}

	return ""
}
