package services

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/kazuph/obails/models"
)

// TaskItem represents a single task (checkbox) found in a markdown file
type TaskItem struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Content string `json:"content"`
	Done    bool   `json:"done"`
	Status  string `json:"status"` // " " (todo), "x" (done), "-" (cancelled), "/" (in-progress), etc.
	Ref     string `json:"ref"`
}

type taskReference struct {
	File       string `json:"file"`
	Line       int    `json:"line"`
	Generation string `json:"generation"`
	Identity   string `json:"identity"`
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
	snapshot, err := s.fileService.ReadSnapshot(relativePath)
	if err != nil {
		return nil, err
	}

	return s.parseTasksFromContent(snapshot.Content, snapshot.Path), nil
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
		snapshot, err := s.fileService.ReadSnapshot(relPath)
		if err != nil {
			return nil
		}

		tasks := s.parseTasksFromContent(snapshot.Content, snapshot.Path)
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

// ToggleTaskRef toggles a task only when its issued file generation and identity still match.
func (s *TaskService) ToggleTaskRef(encodedRef string) (string, error) {
	snapshot, lines, lineIndex, matches, err := s.resolveTaskReference(encodedRef)
	if err != nil {
		return "", err
	}

	newStatus := "x"
	if matches[2] == "x" {
		newStatus = " "
	}
	lines[lineIndex] = matches[1] + "- [" + newStatus + "] " + matches[3]
	return s.commitTaskReference(snapshot, lines, lineIndex)
}

// SetTaskStatusRef sets a task status only when its issued file generation and identity still match.
func (s *TaskService) SetTaskStatusRef(encodedRef string, status string) (string, error) {
	if len(status) != 1 {
		return "", fmt.Errorf("status must be a single character, got %q", status)
	}

	snapshot, lines, lineIndex, matches, err := s.resolveTaskReference(encodedRef)
	if err != nil {
		return "", err
	}

	lines[lineIndex] = matches[1] + "- [" + status + "] " + matches[3]
	return s.commitTaskReference(snapshot, lines, lineIndex)
}

func (s *TaskService) resolveTaskReference(encodedRef string) (models.FileSnapshot, []string, int, []string, error) {
	reference, err := decodeTaskReference(encodedRef)
	if err != nil {
		return models.FileSnapshot{}, nil, 0, nil, err
	}

	snapshot, err := s.fileService.ReadSnapshot(reference.File)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return models.FileSnapshot{}, nil, 0, nil, fmt.Errorf("stale task reference: file missing")
		}
		return models.FileSnapshot{}, nil, 0, nil, err
	}
	if taskContentGeneration(snapshot.Content) != reference.Generation {
		return models.FileSnapshot{}, nil, 0, nil, fmt.Errorf("stale task reference: file content changed")
	}

	lines := strings.Split(snapshot.Content, "\n")
	if reference.Line < 1 || reference.Line > len(lines) {
		return models.FileSnapshot{}, nil, 0, nil, fmt.Errorf("invalid task reference: line %d is out of range", reference.Line)
	}

	lineIndex := reference.Line - 1
	matches := taskRegex.FindStringSubmatch(lines[lineIndex])
	if matches == nil || taskIdentity(lines[lineIndex]) != reference.Identity {
		return models.FileSnapshot{}, nil, 0, nil, fmt.Errorf("stale task reference: task identity changed")
	}

	return snapshot, lines, lineIndex, matches, nil
}

func (s *TaskService) commitTaskReference(snapshot models.FileSnapshot, lines []string, lineIndex int) (string, error) {
	content := strings.Join(lines, "\n")
	result, err := s.fileService.SaveIfUnchanged(snapshot, content)
	if err != nil {
		return "", err
	}
	switch result.Status {
	case models.FileSaveStatusSaved:
		if result.Snapshot == nil {
			return "", fmt.Errorf("task update failed: missing saved snapshot")
		}
		return newTaskReference(result.Snapshot.Path, lineIndex+1, result.Snapshot.Content, lines[lineIndex]), nil
	case models.FileSaveStatusConflict, models.FileSaveStatusMissing:
		return "", fmt.Errorf("stale task reference: file changed before update")
	default:
		return "", fmt.Errorf("task update failed: unexpected save result %q", result.Status)
	}
}

func newTaskReference(filePath string, line int, content string, taskLine string) string {
	return encodeTaskReference(taskReference{
		File:       filePath,
		Line:       line,
		Generation: taskContentGeneration(content),
		Identity:   taskIdentity(taskLine),
	})

}

func encodeTaskReference(reference taskReference) string {
	payload, _ := json.Marshal(reference)
	return base64.RawURLEncoding.EncodeToString(payload)
}

func decodeTaskReference(encodedRef string) (taskReference, error) {
	payload, err := base64.RawURLEncoding.DecodeString(encodedRef)
	if err != nil {
		return taskReference{}, fmt.Errorf("invalid task reference: %w", err)
	}

	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	var reference taskReference
	if err := decoder.Decode(&reference); err != nil {
		return taskReference{}, fmt.Errorf("invalid task reference: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return taskReference{}, fmt.Errorf("invalid task reference")
	}
	if reference.File == "" || reference.Line < 1 || !isSHA256Digest(reference.Generation) || !isSHA256Digest(reference.Identity) {
		return taskReference{}, fmt.Errorf("invalid task reference")
	}
	return reference, nil
}

func isSHA256Digest(value string) bool {
	digest, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(digest) == sha256.Size
}

func taskContentGeneration(content string) string {
	sum := sha256.Sum256([]byte(content))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func taskIdentity(line string) string {
	sum := sha256.Sum256([]byte(line))
	return base64.RawURLEncoding.EncodeToString(sum[:])
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
			Ref:     newTaskReference(filePath, i+1, content, line),
		})
	}

	return tasks
}
