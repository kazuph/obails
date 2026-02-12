package services

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// TaskItem represents a single task (checkbox) found in a markdown file
type TaskItem struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Content string `json:"content"`
	Done    bool   `json:"done"`
	Status  string `json:"status"` // " " (todo), "x" (done), "-" (cancelled), "/" (in-progress), etc.
}

// TaskService handles task (checkbox) operations across vault files
type TaskService struct {
	fileService   *FileService
	noteService   *NoteService
	configService *ConfigService
}

// NewTaskService creates a new TaskService
func NewTaskService(fileService *FileService, noteService *NoteService, configService *ConfigService) *TaskService {
	return &TaskService{
		fileService:   fileService,
		noteService:   noteService,
		configService: configService,
	}
}

// taskRegex matches markdown task lines: - [ ] text, - [x] text, - [-] text, etc.
var taskRegex = regexp.MustCompile(`^(\s*)- \[(.)\] (.+)$`)

// ParseTasksInFile extracts all tasks from a single file
func (s *TaskService) ParseTasksInFile(relativePath string) ([]TaskItem, error) {
	content, err := s.fileService.ReadFile(relativePath)
	if err != nil {
		return nil, err
	}

	return s.parseTasksFromContent(content, relativePath), nil
}

// ParseAllTasks extracts all tasks from all markdown files in the vault
func (s *TaskService) ParseAllTasks() ([]TaskItem, error) {
	vaultPath := s.configService.GetVaultPath()
	var allTasks []TaskItem

	err := filepath.Walk(vaultPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") {
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

		relPath, _ := filepath.Rel(vaultPath, path)
		content, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		tasks := s.parseTasksFromContent(string(content), relPath)
		allTasks = append(allTasks, tasks...)
		return nil
	})

	return allTasks, err
}

// ParseDailyTasks extracts tasks from today's daily note
func (s *TaskService) ParseDailyTasks() ([]TaskItem, error) {
	note, err := s.noteService.GetTodayDailyNote()
	if err != nil {
		return nil, fmt.Errorf("failed to get today's daily note: %w", err)
	}

	return s.parseTasksFromContent(note.Content, note.Path), nil
}

// ToggleTask toggles the checkbox status of a task at the given line
// [ ] -> [x], [x] -> [ ], any other -> [ ]
func (s *TaskService) ToggleTask(relativePath string, lineNumber int) error {
	content, err := s.fileService.ReadFile(relativePath)
	if err != nil {
		return err
	}

	lines := strings.Split(content, "\n")
	if lineNumber < 1 || lineNumber > len(lines) {
		return fmt.Errorf("line %d out of range (file has %d lines)", lineNumber, len(lines))
	}

	line := lines[lineNumber-1]
	matches := taskRegex.FindStringSubmatch(line)
	if matches == nil {
		return fmt.Errorf("line %d is not a task: %q", lineNumber, line)
	}

	currentStatus := matches[2]
	var newStatus string
	if currentStatus == "x" {
		newStatus = " "
	} else {
		newStatus = "x"
	}

	lines[lineNumber-1] = matches[1] + "- [" + newStatus + "] " + matches[3]
	return s.fileService.WriteFile(relativePath, strings.Join(lines, "\n"))
}

// SetTaskStatus sets the checkbox status of a task at the given line to a specific character
func (s *TaskService) SetTaskStatus(relativePath string, lineNumber int, status string) error {
	if len(status) != 1 {
		return fmt.Errorf("status must be a single character, got %q", status)
	}

	content, err := s.fileService.ReadFile(relativePath)
	if err != nil {
		return err
	}

	lines := strings.Split(content, "\n")
	if lineNumber < 1 || lineNumber > len(lines) {
		return fmt.Errorf("line %d out of range (file has %d lines)", lineNumber, len(lines))
	}

	line := lines[lineNumber-1]
	matches := taskRegex.FindStringSubmatch(line)
	if matches == nil {
		return fmt.Errorf("line %d is not a task: %q", lineNumber, line)
	}

	lines[lineNumber-1] = matches[1] + "- [" + status + "] " + matches[3]
	return s.fileService.WriteFile(relativePath, strings.Join(lines, "\n"))
}

// parseTasksFromContent parses task items from markdown content
func (s *TaskService) parseTasksFromContent(content string, filePath string) []TaskItem {
	lines := strings.Split(content, "\n")
	var tasks []TaskItem

	for i, line := range lines {
		matches := taskRegex.FindStringSubmatch(line)
		if matches == nil {
			continue
		}

		status := matches[2]
		taskContent := matches[3]

		tasks = append(tasks, TaskItem{
			File:    filePath,
			Line:    i + 1,
			Content: taskContent,
			Done:    status == "x",
			Status:  status,
		})
	}

	return tasks
}
