package services

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/kazuph/obails/models"
)

// NoteService handles note operations
type NoteService struct {
	fileService   *FileService
	configService *ConfigService
}

// NewNoteService creates a new NoteService
func NewNoteService(fileService *FileService, configService *ConfigService) *NoteService {
	return &NoteService{
		fileService:   fileService,
		configService: configService,
	}
}

// GetNote reads a note from the vault
func (s *NoteService) GetNote(relativePath string) (*models.Note, error) {
	content, err := s.fileService.ReadFile(relativePath)
	if err != nil {
		return nil, err
	}

	fileInfo, err := s.fileService.GetFileInfo(relativePath)
	if err != nil {
		return nil, err
	}

	note := &models.Note{
		Path:       relativePath,
		Title:      s.extractTitle(content, relativePath),
		Content:    content,
		ModifiedAt: fileInfo.ModifiedAt,
	}

	return note, nil
}

// SaveNote saves a note to the vault
func (s *NoteService) SaveNote(relativePath string, content string) error {
	return s.fileService.WriteFile(relativePath, content)
}

// GetDailyNote gets or creates a daily note for a specific date
func (s *NoteService) GetDailyNote(dateStr string) (*models.Note, error) {
	// Parse the date string (YYYY-MM-DD format from frontend)
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return nil, err
	}

	folder := s.configService.GetDailyNotesFolder()
	format := s.configService.GetDailyNotesFormat()
	filename := date.Format(format) + ".md"
	relativePath := filepath.Join(folder, filename)

	// Check if the daily note exists
	if s.fileService.FileExists(relativePath) {
		return s.GetNote(relativePath)
	}

	return nil, fmt.Errorf("daily note not found: %s", relativePath)
}

// CreateDailyNote creates a new daily note for a specific date
func (s *NoteService) CreateDailyNote(dateStr string) (*models.Note, error) {
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return nil, err
	}

	folder := s.configService.GetDailyNotesFolder()
	format := s.configService.GetDailyNotesFormat()
	filename := date.Format(format) + ".md"
	relativePath := filepath.Join(folder, filename)

	// Create initial content with template
	content := s.generateDailyNoteTemplate(date)

	if err := s.fileService.WriteFile(relativePath, content); err != nil {
		return nil, err
	}

	return s.GetNote(relativePath)
}

// GetTodayDailyNote gets or creates today's daily note
func (s *NoteService) GetTodayDailyNote() (*models.Note, error) {
	today := time.Now().Format("2006-01-02")
	note, err := s.GetDailyNote(today)
	if err != nil {
		// Create if doesn't exist
		return s.CreateDailyNote(today)
	}
	return note, nil
}

// AddThino adds a memo to the current daily note's Memos section
func (s *NoteService) AddThino(content string) error {
	note, err := s.GetTodayDailyNote()
	if err != nil {
		return err
	}

	// Format the thino entry
	timeStr := time.Now().Format(s.configService.GetThinoTimeFormat())
	thinoEntry := fmt.Sprintf("- %s %s", timeStr, content)

	// Find the Memos section and insert the new entry
	section := s.configService.GetThinoSection()
	newContent := s.insertAfterSection(note.Content, section, thinoEntry)

	return s.SaveNote(note.Path, newContent)
}

// GetThinos extracts all Thino entries from a daily note
func (s *NoteService) GetThinos(dateStr string) ([]models.Thino, error) {
	note, err := s.GetDailyNote(dateStr)
	if err != nil {
		return nil, err
	}

	return s.parseThinos(note.Content), nil
}

// GetTodayThinos gets all Thino entries from today's daily note
func (s *NoteService) GetTodayThinos() ([]models.Thino, error) {
	today := time.Now().Format("2006-01-02")
	return s.GetThinos(today)
}

// Helper functions

func (s *NoteService) extractTitle(content string, path string) string {
	// Try to find a # heading
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			return strings.TrimPrefix(line, "# ")
		}
	}
	// Fall back to filename without extension
	return strings.TrimSuffix(filepath.Base(path), ".md")
}

func (s *NoteService) generateDailyNoteTemplate(date time.Time) string {
	dateStr := date.Format("2006-01-02")
	timeStr := time.Now().Format("15:04:05")

	return fmt.Sprintf(`---
date: %s %s
tags:
  - note
---

# Today's

## Day Planner
- [ ] 09:00 Plan the day

## Memos

## Todo

`, dateStr, timeStr)
}

func (s *NoteService) insertAfterSection(content string, section string, entry string) string {
	lines := strings.Split(content, "\n")
	var result []string
	found := false

	for i, line := range lines {
		result = append(result, line)
		if strings.TrimSpace(line) == section {
			found = true
			// Insert the entry after the section header
			// Check if next line is empty, if not add an empty line first
			if i+1 < len(lines) && strings.TrimSpace(lines[i+1]) != "" {
				result = append(result, "")
			}
			result = append(result, entry)
		}
	}

	if !found {
		// Section not found, append at the end
		result = append(result, "", section, entry)
	}

	return strings.Join(result, "\n")
}

func (s *NoteService) parseThinos(content string) []models.Thino {
	var thinos []models.Thino

	section := s.configService.GetThinoSection()
	lines := strings.Split(content, "\n")
	inMemosSection := false

	// Regex to match Thino entries: - HH:MM content or - [x] HH:MM content
	thinoRegex := regexp.MustCompile(`^-\s+(?:\[([ x])\]\s+)?(\d{1,2}:\d{2})\s+(.+)$`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Check for section headers
		if strings.HasPrefix(trimmed, "## ") {
			if trimmed == section {
				inMemosSection = true
			} else {
				inMemosSection = false
			}
			continue
		}

		if inMemosSection {
			matches := thinoRegex.FindStringSubmatch(trimmed)
			if len(matches) == 4 {
				checkbox := matches[1]
				timeStr := matches[2]
				text := matches[3]

				thino := models.Thino{
					Time:    timeStr,
					Content: text,
					IsTodo:  checkbox != "",
					Done:    checkbox == "x",
				}
				thinos = append(thinos, thino)
			}
		}
	}

	return thinos
}
