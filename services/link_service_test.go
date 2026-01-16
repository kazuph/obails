package services

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kazuph/obails/models"
)

func newTestLinkService(t *testing.T) (*LinkService, *FileService, string) {
	t.Helper()
	tmpDir, err := os.MkdirTemp("", "obails-link-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	cs := &ConfigService{
		configPath: filepath.Join(tmpDir, "config.toml"),
		config: &models.Config{
			Vault: models.VaultConfig{
				Path: tmpDir,
			},
		},
	}

	fs := NewFileService(cs)
	ls := NewLinkService(fs, cs)
	return ls, fs, tmpDir
}

func TestLinkService_ParseLinks(t *testing.T) {
	ls, _, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	tests := []struct {
		name     string
		content  string
		expected []string
	}{
		{
			name:     "single link",
			content:  "Check out [[My Note]]",
			expected: []string{"My Note"},
		},
		{
			name:     "multiple links",
			content:  "See [[Note A]] and [[Note B]] for details",
			expected: []string{"Note A", "Note B"},
		},
		{
			name:     "link with alias",
			content:  "Click [[actual-note|display text]] here",
			expected: []string{"actual-note"},
		},
		{
			name:     "link with heading",
			content:  "Jump to [[Note#Section]]",
			expected: []string{"Note"},
		},
		{
			name:     "link with alias and heading",
			content:  "See [[My Note#Intro|Introduction]]",
			expected: []string{"My Note"},
		},
		{
			name:     "no links",
			content:  "This is plain text",
			expected: nil,
		},
		{
			name:     "duplicate links deduplicated",
			content:  "[[Same]] and [[Same]] again",
			expected: []string{"Same"},
		},
		{
			name:     "nested brackets ignored",
			content:  "[[Valid]] but [not a link]",
			expected: []string{"Valid"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			links := ls.ParseLinks(tt.content)

			if len(links) != len(tt.expected) {
				t.Errorf("Expected %d links, got %d: %v", len(tt.expected), len(links), links)
				return
			}

			for i, expected := range tt.expected {
				if links[i] != expected {
					t.Errorf("Link %d: expected %q, got %q", i, expected, links[i])
				}
			}
		})
	}
}

func TestLinkService_ResolveLink(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup test files
	fs.CreateFile("root-note.md", "# Root Note")
	fs.CreateFile("folder/nested-note.md", "# Nested Note")
	fs.CreateFile("Another Note.md", "# Another Note")

	t.Run("resolve exact path", func(t *testing.T) {
		path, exists := ls.ResolveLink("root-note")
		if !exists {
			t.Error("Should resolve existing file")
		}
		if path != "root-note.md" {
			t.Errorf("Unexpected path: %s", path)
		}
	})

	t.Run("resolve with .md extension", func(t *testing.T) {
		path, exists := ls.ResolveLink("root-note.md")
		if !exists {
			t.Error("Should resolve with explicit extension")
		}
		if path != "root-note.md" {
			t.Errorf("Unexpected path: %s", path)
		}
	})

	t.Run("resolve nested file by name", func(t *testing.T) {
		path, exists := ls.ResolveLink("nested-note")
		if !exists {
			t.Error("Should resolve nested file")
		}
		if path != "folder/nested-note.md" {
			t.Errorf("Unexpected path: %s", path)
		}
	})

	t.Run("resolve file with spaces", func(t *testing.T) {
		path, exists := ls.ResolveLink("Another Note")
		if !exists {
			t.Error("Should resolve file with spaces")
		}
		if path != "Another Note.md" {
			t.Errorf("Unexpected path: %s", path)
		}
	})

	t.Run("non-existent file", func(t *testing.T) {
		_, exists := ls.ResolveLink("ghost")
		if exists {
			t.Error("Should not resolve non-existent file")
		}
	})
}

func TestLinkService_RebuildIndex(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup test vault structure
	fs.CreateFile("note-a.md", "# Note A\n\nLinks to [[note-b]] and [[note-c]]")
	fs.CreateFile("note-b.md", "# Note B\n\nLinks back to [[note-a]]")
	fs.CreateFile("note-c.md", "# Note C\n\nNo outgoing links")
	fs.CreateFile("folder/note-d.md", "# Note D\n\nLinks to [[note-a]]")

	t.Run("rebuild index", func(t *testing.T) {
		err := ls.RebuildIndex()
		if err != nil {
			t.Fatalf("RebuildIndex failed: %v", err)
		}

		stats := ls.GetIndexStats()
		if stats["totalFiles"] != 4 {
			t.Errorf("Expected 4 files indexed, got %d", stats["totalFiles"])
		}
	})

	t.Run("get backlinks", func(t *testing.T) {
		ls.RebuildIndex()

		backlinks := ls.GetBacklinks("note-a.md")

		// note-b and note-d link to note-a
		if len(backlinks) < 2 {
			t.Errorf("Expected at least 2 backlinks, got %d", len(backlinks))
		}

		// Verify backlink sources
		sources := make(map[string]bool)
		for _, bl := range backlinks {
			sources[bl.SourcePath] = true
		}

		if !sources["note-b.md"] {
			t.Error("note-b.md should be a backlink source")
		}
		if !sources["folder/note-d.md"] {
			t.Error("folder/note-d.md should be a backlink source")
		}
	})

	t.Run("no backlinks for unlinked note", func(t *testing.T) {
		ls.RebuildIndex()

		backlinks := ls.GetBacklinks("note-c.md")
		// note-a links to note-c
		if len(backlinks) != 1 {
			t.Errorf("Expected 1 backlink to note-c, got %d", len(backlinks))
		}
	})
}

func TestLinkService_GetLinkInfo(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup
	fs.CreateFile("source.md", "# Source\n\nLinks to [[existing]] and [[missing]]")
	fs.CreateFile("existing.md", "# Existing Note")

	t.Run("get link info with mixed existence", func(t *testing.T) {
		links, err := ls.GetLinkInfo("source.md")
		if err != nil {
			t.Fatalf("GetLinkInfo failed: %v", err)
		}

		if len(links) != 2 {
			t.Fatalf("Expected 2 links, got %d", len(links))
		}

		// Check existing link
		existingFound := false
		missingFound := false
		for _, link := range links {
			if link.Text == "existing" {
				existingFound = true
				if !link.Exists {
					t.Error("'existing' link should exist")
				}
			}
			if link.Text == "missing" {
				missingFound = true
				if link.Exists {
					t.Error("'missing' link should not exist")
				}
			}
		}

		if !existingFound {
			t.Error("'existing' link not found")
		}
		if !missingFound {
			t.Error("'missing' link not found")
		}
	})
}

func TestLinkService_BacklinkContext(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup
	fs.CreateFile("source.md", "# Source\n\nSome context around [[target]] link here")
	fs.CreateFile("target.md", "# Target Note")

	ls.RebuildIndex()

	t.Run("backlink includes context", func(t *testing.T) {
		backlinks := ls.GetBacklinks("target.md")

		if len(backlinks) == 0 {
			t.Fatal("Expected at least one backlink")
		}

		if backlinks[0].Context == "" {
			t.Error("Backlink should include context")
		}

		if backlinks[0].SourceTitle != "source" {
			t.Errorf("Expected source title 'source', got '%s'", backlinks[0].SourceTitle)
		}
	})
}

func TestLinkService_HiddenFilesIgnored(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup with hidden file
	fs.CreateFile("visible.md", "# Visible\n\nLinks to [[hidden]]")
	fs.CreateFile(".hidden.md", "# Hidden\n\nLinks to [[visible]]")

	ls.RebuildIndex()

	stats := ls.GetIndexStats()
	if stats["totalFiles"] != 1 {
		t.Errorf("Expected 1 file (hidden ignored), got %d", stats["totalFiles"])
	}
}

func TestLinkService_ConcurrentAccess(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup
	fs.CreateFile("note.md", "# Note\n\n[[link]]")

	// Run concurrent operations
	done := make(chan bool)

	go func() {
		for i := 0; i < 10; i++ {
			ls.RebuildIndex()
		}
		done <- true
	}()

	go func() {
		for i := 0; i < 10; i++ {
			ls.GetBacklinks("note.md")
		}
		done <- true
	}()

	go func() {
		for i := 0; i < 10; i++ {
			ls.GetIndexStats()
		}
		done <- true
	}()

	// Wait for all goroutines
	<-done
	<-done
	<-done

	// If we get here without deadlock/panic, test passes
}
