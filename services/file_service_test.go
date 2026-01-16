package services

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kazuph/obails/models"
)

// mockConfigService creates a ConfigService with a temporary vault path for testing
func newTestConfigService(t *testing.T) (*ConfigService, string) {
	t.Helper()
	tmpDir, err := os.MkdirTemp("", "obails-test-*")
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
	return cs, tmpDir
}

func TestFileService_CreateFile(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	t.Run("create new file", func(t *testing.T) {
		err := fs.CreateFile("test.md", "# Test\n\nContent")
		if err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}

		// Verify file exists
		content, err := fs.ReadFile("test.md")
		if err != nil {
			t.Fatalf("ReadFile failed: %v", err)
		}
		if content != "# Test\n\nContent" {
			t.Errorf("Content mismatch: got %q", content)
		}
	})

	t.Run("create file in subfolder", func(t *testing.T) {
		err := fs.CreateFile("subfolder/nested.md", "# Nested")
		if err != nil {
			t.Fatalf("CreateFile in subfolder failed: %v", err)
		}

		if !fs.FileExists("subfolder/nested.md") {
			t.Error("File should exist in subfolder")
		}
	})

	t.Run("fail to create existing file", func(t *testing.T) {
		err := fs.CreateFile("test.md", "duplicate")
		if err == nil {
			t.Error("Should fail when file exists")
		}
		if err != os.ErrExist {
			t.Errorf("Expected ErrExist, got: %v", err)
		}
	})
}

func TestFileService_DeletePath(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	t.Run("delete file", func(t *testing.T) {
		// Create file first
		err := fs.CreateFile("to-delete.md", "delete me")
		if err != nil {
			t.Fatalf("Setup failed: %v", err)
		}

		// Delete it
		err = fs.DeletePath("to-delete.md")
		if err != nil {
			t.Fatalf("DeletePath failed: %v", err)
		}

		// Verify it's gone
		if fs.FileExists("to-delete.md") {
			t.Error("File should be deleted")
		}
	})

	t.Run("delete directory with contents", func(t *testing.T) {
		// Create directory with files
		err := fs.CreateFile("dir-to-delete/file1.md", "content1")
		if err != nil {
			t.Fatalf("Setup failed: %v", err)
		}
		err = fs.CreateFile("dir-to-delete/file2.md", "content2")
		if err != nil {
			t.Fatalf("Setup failed: %v", err)
		}

		// Delete directory
		err = fs.DeletePath("dir-to-delete")
		if err != nil {
			t.Fatalf("DeletePath for directory failed: %v", err)
		}

		// Verify it's gone
		if fs.FileExists("dir-to-delete") {
			t.Error("Directory should be deleted")
		}
	})

	t.Run("delete non-existent path", func(t *testing.T) {
		err := fs.DeletePath("non-existent.md")
		if err == nil {
			t.Error("Should fail for non-existent path")
		}
	})
}

func TestFileService_MoveFile(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	t.Run("move file to another location", func(t *testing.T) {
		// Create file
		err := fs.CreateFile("source.md", "move me")
		if err != nil {
			t.Fatalf("Setup failed: %v", err)
		}

		// Move it
		err = fs.MoveFile("source.md", "dest.md")
		if err != nil {
			t.Fatalf("MoveFile failed: %v", err)
		}

		// Verify source is gone and dest exists
		if fs.FileExists("source.md") {
			t.Error("Source should not exist after move")
		}
		if !fs.FileExists("dest.md") {
			t.Error("Destination should exist after move")
		}

		// Verify content
		content, _ := fs.ReadFile("dest.md")
		if content != "move me" {
			t.Errorf("Content should be preserved, got: %q", content)
		}
	})

	t.Run("move file into folder", func(t *testing.T) {
		// Create file and folder
		err := fs.CreateFile("file-to-move.md", "content")
		if err != nil {
			t.Fatalf("Setup failed: %v", err)
		}
		err = fs.CreateDirectory("target-folder")
		if err != nil {
			t.Fatalf("Setup failed: %v", err)
		}

		// Move into folder
		err = fs.MoveFile("file-to-move.md", "target-folder/file-to-move.md")
		if err != nil {
			t.Fatalf("MoveFile into folder failed: %v", err)
		}

		if !fs.FileExists("target-folder/file-to-move.md") {
			t.Error("File should exist in target folder")
		}
	})

	t.Run("move file out of folder to root", func(t *testing.T) {
		// Create file in folder
		err := fs.CreateFile("folder/nested-file.md", "nested content")
		if err != nil {
			t.Fatalf("Setup failed: %v", err)
		}

		// Move to root
		err = fs.MoveFile("folder/nested-file.md", "nested-file.md")
		if err != nil {
			t.Fatalf("MoveFile to root failed: %v", err)
		}

		if fs.FileExists("folder/nested-file.md") {
			t.Error("File should not exist in original location")
		}
		if !fs.FileExists("nested-file.md") {
			t.Error("File should exist at root")
		}
	})

	t.Run("fail to move to existing destination", func(t *testing.T) {
		// Create two files
		fs.CreateFile("src.md", "source")
		fs.CreateFile("existing.md", "existing")

		err := fs.MoveFile("src.md", "existing.md")
		if err == nil {
			t.Error("Should fail when destination exists")
		}
		if err != os.ErrExist {
			t.Errorf("Expected ErrExist, got: %v", err)
		}
	})

	t.Run("fail to move non-existent file", func(t *testing.T) {
		err := fs.MoveFile("ghost.md", "somewhere.md")
		if err == nil {
			t.Error("Should fail for non-existent source")
		}
	})
}

func TestFileService_ListDirectory(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	// Setup test structure
	fs.CreateDirectory("folder-a")
	fs.CreateDirectory("folder-b")
	fs.CreateFile("note1.md", "content1")
	fs.CreateFile("note2.md", "content2")
	fs.CreateFile("folder-a/nested.md", "nested")

	t.Run("list root directory", func(t *testing.T) {
		files, err := fs.ListDirectory("")
		if err != nil {
			t.Fatalf("ListDirectory failed: %v", err)
		}

		// Should have 2 folders and 2 files
		folderCount := 0
		fileCount := 0
		for _, f := range files {
			if f.IsDir {
				folderCount++
			} else {
				fileCount++
			}
		}

		if folderCount != 2 {
			t.Errorf("Expected 2 folders, got %d", folderCount)
		}
		if fileCount != 2 {
			t.Errorf("Expected 2 files, got %d", fileCount)
		}
	})

	t.Run("folders come before files", func(t *testing.T) {
		files, _ := fs.ListDirectory("")

		// First items should be folders
		foundFileBeforeFolder := false
		seenFolder := false
		for _, f := range files {
			if f.IsDir {
				if foundFileBeforeFolder {
					t.Error("Folders should come before files")
				}
				seenFolder = true
			} else {
				if seenFolder {
					foundFileBeforeFolder = false // This is expected
				} else {
					foundFileBeforeFolder = true
				}
			}
		}
	})

	t.Run("skip hidden files", func(t *testing.T) {
		// Create hidden file
		hiddenPath := filepath.Join(tmpDir, ".hidden.md")
		os.WriteFile(hiddenPath, []byte("hidden"), 0644)

		files, _ := fs.ListDirectory("")

		for _, f := range files {
			if f.Name == ".hidden.md" {
				t.Error("Hidden files should be skipped")
			}
		}
	})
}

func TestFileService_SearchFiles(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	// Setup test structure
	fs.CreateFile("meeting-notes.md", "meeting content")
	fs.CreateFile("project-notes.md", "project content")
	fs.CreateFile("random.md", "random content")
	fs.CreateFile("folder/deep-notes.md", "deep content")

	t.Run("search by pattern", func(t *testing.T) {
		results, err := fs.SearchFiles("notes")
		if err != nil {
			t.Fatalf("SearchFiles failed: %v", err)
		}

		if len(results) != 3 {
			t.Errorf("Expected 3 results, got %d", len(results))
		}
	})

	t.Run("case insensitive search", func(t *testing.T) {
		results, _ := fs.SearchFiles("NOTES")
		if len(results) != 3 {
			t.Errorf("Search should be case insensitive, got %d results", len(results))
		}
	})

	t.Run("no results for unknown pattern", func(t *testing.T) {
		results, _ := fs.SearchFiles("xyz123")
		if len(results) != 0 {
			t.Errorf("Expected 0 results, got %d", len(results))
		}
	})
}

func TestFileService_WriteFile(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	t.Run("write new file", func(t *testing.T) {
		err := fs.WriteFile("new.md", "new content")
		if err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}

		content, _ := fs.ReadFile("new.md")
		if content != "new content" {
			t.Errorf("Content mismatch: %q", content)
		}
	})

	t.Run("overwrite existing file", func(t *testing.T) {
		fs.WriteFile("overwrite.md", "original")
		fs.WriteFile("overwrite.md", "updated")

		content, _ := fs.ReadFile("overwrite.md")
		if content != "updated" {
			t.Errorf("File should be overwritten, got: %q", content)
		}
	})
}
