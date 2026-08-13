package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/kazuph/obails/models"
)

func newTestNoteService(t *testing.T) (*NoteService, *FileService, string) {
	t.Helper()
	tmpDir, err := os.MkdirTemp("", "obails-note-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	cs := &ConfigService{
		configPath: filepath.Join(tmpDir, "config.toml"),
		config: &models.Config{
			Vault: models.VaultConfig{
				Path: tmpDir,
			},
			DailyNotes: models.DailyNotesConfig{
				Folder: "dailynotes",
				Format: "2006-01-02",
			},
			Timeline: models.TimelineConfig{
				Section:    "## Memos",
				TimeFormat: "15:04",
			},
		},
	}

	fs := NewFileService(cs)
	ns := NewNoteService(fs, cs)
	return ns, fs, tmpDir
}

func TestNoteService_GetNote(t *testing.T) {
	ns, fs, tmpDir := newTestNoteService(t)
	defer os.RemoveAll(tmpDir)

	t.Run("get existing note", func(t *testing.T) {
		content := "---\naliases:\n  - Standup\nalias: Meeting\n---\n# Heading that is not the filename\n\nSome content here"
		err := fs.CreateFile("test-note.md", content)
		if err != nil {
			t.Fatalf("Setup failed: %v", err)
		}

		note, err := ns.GetNote("test-note.md")
		if err != nil {
			t.Fatalf("GetNote failed: %v", err)
		}

		if note.Title != "test-note" {
			t.Errorf("Expected filename title 'test-note', got '%s'", note.Title)
		}
		if note.Content != content {
			t.Errorf("Content mismatch")
		}
		if note.Path != "test-note.md" {
			t.Errorf("Path mismatch: got '%s'", note.Path)
		}
		aliases, ok := note.Frontmatter["aliases"].([]interface{})
		if !ok || len(aliases) != 1 || aliases[0] != "Standup" {
			t.Errorf("Expected aliases frontmatter, got %#v", note.Frontmatter["aliases"])
		}
		if note.Frontmatter["alias"] != "Meeting" {
			t.Errorf("Expected scalar alias frontmatter, got %#v", note.Frontmatter["alias"])
		}
	})

	t.Run("title fallback to filename", func(t *testing.T) {
		content := "No heading here, just content"
		fs.CreateFile("no-heading.md", content)

		note, _ := ns.GetNote("no-heading.md")
		if note.Title != "no-heading" {
			t.Errorf("Expected fallback title 'no-heading', got '%s'", note.Title)
		}
	})

	t.Run("get non-existent note", func(t *testing.T) {
		_, err := ns.GetNote("ghost.md")
		if err == nil {
			t.Error("Should fail for non-existent note")
		}
	})
}

func TestNoteService_SaveNote(t *testing.T) {
	ns, fs, tmpDir := newTestNoteService(t)
	defer os.RemoveAll(tmpDir)

	t.Run("save note", func(t *testing.T) {
		fs.CreateFile("savable.md", "original")

		err := ns.SaveNote("savable.md", "updated content")
		if err != nil {
			t.Fatalf("SaveNote failed: %v", err)
		}

		content, _ := fs.ReadFile("savable.md")
		if content != "updated content" {
			t.Errorf("Content not saved: got '%s'", content)
		}
	})
}

func TestNoteService_SaveNoteCAS(t *testing.T) {
	ns, fs, tmpDir := newTestNoteService(t)
	defer os.RemoveAll(tmpDir)

	if err := fs.CreateFile("cas-note.md", "# Different heading\n\noriginal"); err != nil {
		t.Fatalf("CreateFile failed: %v", err)
	}
	note, err := ns.GetNote("cas-note.md")
	if err != nil {
		t.Fatalf("GetNote failed: %v", err)
	}

	result, err := ns.SaveNoteCAS(models.FileSnapshot{
		Path:     note.Path,
		Content:  note.Content,
		Revision: note.Revision,
	}, "updated")
	if err != nil {
		t.Fatalf("SaveNoteCAS failed: %v", err)
	}
	if result.Status != models.FileSaveStatusSaved {
		t.Fatalf("Expected saved result, got %+v", result)
	}
}

func TestNoteService_DailyNote(t *testing.T) {
	ns, fs, tmpDir := newTestNoteService(t)
	defer os.RemoveAll(tmpDir)

	// Create dailynotes folder
	fs.CreateDirectory("dailynotes")

	t.Run("create daily note", func(t *testing.T) {
		dateStr := "2025-01-15"
		note, err := ns.CreateDailyNote(dateStr)
		if err != nil {
			t.Fatalf("CreateDailyNote failed: %v", err)
		}

		if note.Path != "dailynotes/2025-01-15.md" {
			t.Errorf("Unexpected path: %s", note.Path)
		}

		// Verify file was created
		if !fs.FileExists("dailynotes/2025-01-15.md") {
			t.Error("Daily note file should exist")
		}

		// Verify template content
		if !strings.Contains(note.Content, "## Memos") {
			t.Error("Daily note should contain Memos section")
		}
		if !strings.Contains(note.Content, "## Day Planner") {
			t.Error("Daily note should contain Day Planner section")
		}
	})

	t.Run("get existing daily note", func(t *testing.T) {
		// Create a daily note first
		fs.CreateFile("dailynotes/2025-01-20.md", "# Existing daily note")

		note, err := ns.GetDailyNote("2025-01-20")
		if err != nil {
			t.Fatalf("GetDailyNote failed: %v", err)
		}

		if note.Title != "2025-01-20" {
			t.Errorf("Unexpected title: %s", note.Title)
		}
	})

	t.Run("get non-existent daily note", func(t *testing.T) {
		_, err := ns.GetDailyNote("1999-12-31")
		if err == nil {
			t.Error("Should fail for non-existent daily note")
		}
	})

	t.Run("get today's daily note creates if missing", func(t *testing.T) {
		today := time.Now().Format("2006-01-02")
		expectedPath := filepath.Join("dailynotes", today+".md")

		// Ensure it doesn't exist first
		os.Remove(filepath.Join(tmpDir, expectedPath))

		note, err := ns.GetTodayDailyNote()
		if err != nil {
			t.Fatalf("GetTodayDailyNote failed: %v", err)
		}

		if note.Path != expectedPath {
			t.Errorf("Unexpected path: %s, expected: %s", note.Path, expectedPath)
		}
	})
}

func TestNoteService_Timeline(t *testing.T) {
	ns, fs, tmpDir := newTestNoteService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateDirectory("dailynotes")

	t.Run("add timeline to daily note", func(t *testing.T) {
		err := ns.AddTimeline("Test memo content")
		if err != nil {
			t.Fatalf("AddTimeline failed: %v", err)
		}

		// Verify the timeline was added
		timelines, err := ns.GetTodayTimelines()
		if err != nil {
			t.Fatalf("GetTodayTimelines failed: %v", err)
		}

		if len(timelines) == 0 {
			t.Error("Expected at least one timeline")
		}

		found := false
		for _, timeline := range timelines {
			if timeline.Content == "Test memo content" {
				found = true
				break
			}
		}
		if !found {
			t.Error("Added timeline not found")
		}
	})

	t.Run("add multiple timelines", func(t *testing.T) {
		ns.AddTimeline("First memo")
		ns.AddTimeline("Second memo")

		timelines, _ := ns.GetTodayTimelines()

		// Should have at least 3 (including the one from previous test)
		if len(timelines) < 3 {
			t.Errorf("Expected at least 3 timelines, got %d", len(timelines))
		}
	})
}

func TestNoteService_AddTimelineWithOptions(t *testing.T) {
	ns, fs, tmpDir := newTestNoteService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateDirectory("dailynotes")

	t.Run("add todo timeline entry", func(t *testing.T) {
		err := ns.AddTimelineWithOptions("Buy groceries", true)
		if err != nil {
			t.Fatalf("AddTimelineWithOptions failed: %v", err)
		}

		timelines, err := ns.GetTodayTimelines()
		if err != nil {
			t.Fatalf("GetTodayTimelines failed: %v", err)
		}

		found := false
		for _, tl := range timelines {
			if tl.Content == "Buy groceries" {
				found = true
				if !tl.IsTodo {
					t.Error("Expected timeline entry to be a todo")
				}
				if tl.Done {
					t.Error("Expected timeline entry to not be done")
				}
				break
			}
		}
		if !found {
			t.Error("Todo timeline entry not found")
		}
	})

	t.Run("add regular timeline entry via AddTimelineWithOptions", func(t *testing.T) {
		err := ns.AddTimelineWithOptions("Regular note", false)
		if err != nil {
			t.Fatalf("AddTimelineWithOptions failed: %v", err)
		}

		timelines, err := ns.GetTodayTimelines()
		if err != nil {
			t.Fatalf("GetTodayTimelines failed: %v", err)
		}

		found := false
		for _, tl := range timelines {
			if tl.Content == "Regular note" {
				found = true
				if tl.IsTodo {
					t.Error("Expected timeline entry to not be a todo")
				}
				break
			}
		}
		if !found {
			t.Error("Regular timeline entry not found")
		}
	})
}

func TestNoteService_ParseTimelines(t *testing.T) {
	ns, _, tmpDir := newTestNoteService(t)
	defer os.RemoveAll(tmpDir)

	t.Run("parse timelines from content", func(t *testing.T) {
		content := `# Daily Note

## Day Planner
- [ ] 09:00 Morning standup

## Memos

- 10:30 Regular memo
- 11:45 Another memo
- [ ] 14:00 Todo memo
- [x] 15:30 Completed todo

## Todo
- [ ] Something else
`

		timelines := ns.parseTimelines(content)

		if len(timelines) != 4 {
			t.Errorf("Expected 4 timelines, got %d", len(timelines))
		}

		// Check first timeline
		if timelines[0].Time != "10:30" || timelines[0].Content != "Regular memo" {
			t.Errorf("First timeline mismatch: %+v", timelines[0])
		}

		// Check todo timeline
		if timelines[2].Time != "14:00" || !timelines[2].IsTodo || timelines[2].Done {
			t.Errorf("Todo timeline mismatch: %+v", timelines[2])
		}

		// Check completed timeline
		if timelines[3].Time != "15:30" || !timelines[3].IsTodo || !timelines[3].Done {
			t.Errorf("Completed timeline mismatch: %+v", timelines[3])
		}
	})

	t.Run("timelines only from Memos section", func(t *testing.T) {
		content := `# Daily Note

## Day Planner
- 09:00 This should be ignored

## Memos
- 10:00 This is a timeline

## Todo
- 11:00 This should also be ignored
`
		timelines := ns.parseTimelines(content)

		if len(timelines) != 1 {
			t.Errorf("Expected 1 timeline (only from Memos section), got %d", len(timelines))
		}
	})
}

func TestNoteService_ExtractTitle(t *testing.T) {
	ns, _, tmpDir := newTestNoteService(t)
	defer os.RemoveAll(tmpDir)

	tests := []struct {
		content  string
		path     string
		expected string
	}{
		{"# My Title\n\nContent", "file.md", "file"},
		{"# Title with spaces   \n", "folder/file.md", "file"},
		{"No heading here", "fallback-name.md", "fallback-name"},
		{"## H2 heading\n# Real Title", "file.md", "file"},
		{"", "empty.md", "empty"},
	}

	for _, tt := range tests {
		title := ns.extractTitle(tt.content, tt.path)
		if title != tt.expected {
			t.Errorf("extractTitle(%q, %q) = %q, want %q", tt.content, tt.path, title, tt.expected)
		}
	}
}

func TestNoteService_InsertAfterSection(t *testing.T) {
	ns, _, tmpDir := newTestNoteService(t)
	defer os.RemoveAll(tmpDir)

	t.Run("insert after existing section", func(t *testing.T) {
		content := `# Note

## Memos

## Todo
`
		result := ns.insertAfterSection(content, "## Memos", "- 10:00 New entry")

		// Entry should be inserted after ## Memos section
		if !strings.Contains(result, "## Memos") || !strings.Contains(result, "- 10:00 New entry") {
			t.Errorf("Entry not inserted correctly:\n%s", result)
		}
		// Entry should come before ## Todo
		memosIdx := strings.Index(result, "## Memos")
		entryIdx := strings.Index(result, "- 10:00 New entry")
		todoIdx := strings.Index(result, "## Todo")
		if !(memosIdx < entryIdx && entryIdx < todoIdx) {
			t.Errorf("Entry should be between Memos and Todo sections:\n%s", result)
		}
	})

	t.Run("create section if missing", func(t *testing.T) {
		content := `# Note

Just some content
`
		result := ns.insertAfterSection(content, "## Memos", "- 10:00 New entry")

		if !strings.Contains(result, "## Memos") {
			t.Error("Section should be created if missing")
		}
		if !strings.Contains(result, "- 10:00 New entry") {
			t.Error("Entry should be added")
		}
	})
}
