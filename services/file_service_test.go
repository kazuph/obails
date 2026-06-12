package services

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

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

func TestGetFileType(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		want     string
	}{
		{name: "markdown", filename: "note.md", want: models.FileTypeMarkdown},
		{name: "image", filename: "cover.png", want: models.FileTypeImage},
		{name: "pdf", filename: "paper.pdf", want: models.FileTypePDF},
		{name: "html", filename: "page.html", want: models.FileTypeHTML},
		{name: "text", filename: "notes.txt", want: models.FileTypeText},
		{name: "audio mp3", filename: "podcast.mp3", want: models.FileTypeAudio},
		{name: "audio m4a", filename: "voice.M4A", want: models.FileTypeAudio},
		{name: "audio wav", filename: "tone.wav", want: models.FileTypeAudio},
		{name: "other", filename: "archive.zip", want: models.FileTypeOther},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := GetFileType(tt.filename); got != tt.want {
				t.Fatalf("GetFileType(%q) = %q, want %q", tt.filename, got, tt.want)
			}
		})
	}
}

func TestGetMimeType(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		want     string
	}{
		{name: "mp3", filename: "podcast.mp3", want: "audio/mpeg"},
		{name: "m4a", filename: "voice.m4a", want: "audio/mp4"},
		{name: "wav", filename: "tone.wav", want: "audio/wav"},
		{name: "opus", filename: "episode.opus", want: "audio/ogg"},
		{name: "unknown", filename: "data.bin", want: "application/octet-stream"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := GetMimeType(tt.filename); got != tt.want {
				t.Fatalf("GetMimeType(%q) = %q, want %q", tt.filename, got, tt.want)
			}
		})
	}
}

func TestFileService_ServeMedia(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	wavPath := filepath.Join(tmpDir, "podcast", "episode.wav")
	if err := os.MkdirAll(filepath.Dir(wavPath), 0755); err != nil {
		t.Fatalf("setup dir: %v", err)
	}
	content := []byte("0123456789abcdef")
	if err := os.WriteFile(wavPath, content, 0644); err != nil {
		t.Fatalf("setup wav: %v", err)
	}

	t.Run("serves audio with range support", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/media/audio?path=podcast%2Fepisode.wav", nil)
		req.Header.Set("Range", "bytes=2-5")
		rec := httptest.NewRecorder()

		if handled := fs.ServeMedia(rec, req); !handled {
			t.Fatal("ServeMedia should handle /media/audio")
		}

		res := rec.Result()
		defer res.Body.Close()
		if res.StatusCode != http.StatusPartialContent {
			t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusPartialContent)
		}
		if got := res.Header.Get("Content-Type"); got != "audio/wav" {
			t.Fatalf("Content-Type = %q, want audio/wav", got)
		}
		body, err := io.ReadAll(res.Body)
		if err != nil {
			t.Fatalf("read body: %v", err)
		}
		if string(body) != "2345" {
			t.Fatalf("body = %q, want %q", body, "2345")
		}
	})

	t.Run("rejects non-audio paths", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/media/audio?path=note.md", nil)
		rec := httptest.NewRecorder()

		if handled := fs.ServeMedia(rec, req); !handled {
			t.Fatal("ServeMedia should handle /media/audio")
		}
		if rec.Result().StatusCode != http.StatusUnsupportedMediaType {
			t.Fatalf("status = %d, want %d", rec.Result().StatusCode, http.StatusUnsupportedMediaType)
		}
	})

	t.Run("ignores other routes", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/index.html", nil)
		rec := httptest.NewRecorder()

		if handled := fs.ServeMedia(rec, req); handled {
			t.Fatal("ServeMedia should ignore unrelated routes")
		}
	})
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

	t.Run("reject parent traversal", func(t *testing.T) {
		err := fs.CreateFile("../escape.md", "bad")
		if !errors.Is(err, ErrInvalidPath) {
			t.Fatalf("expected ErrInvalidPath, got %v", err)
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

	t.Run("move directory to another location", func(t *testing.T) {
		err := fs.CreateFile("source-dir/note.md", "dir content")
		if err != nil {
			t.Fatalf("Setup failed: %v", err)
		}

		err = fs.MoveFile("source-dir", "renamed-dir")
		if err != nil {
			t.Fatalf("MoveFile for directory failed: %v", err)
		}

		if fs.FileExists("source-dir/note.md") {
			t.Error("Source directory should be moved")
		}
		if !fs.FileExists("renamed-dir/note.md") {
			t.Error("Destination directory should exist")
		}
	})
}

func TestFileService_CreateDirectory(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	t.Run("create nested directory", func(t *testing.T) {
		err := fs.CreateDirectory("projects/alpha")
		if err != nil {
			t.Fatalf("CreateDirectory failed: %v", err)
		}

		info, err := os.Stat(filepath.Join(tmpDir, "projects", "alpha"))
		if err != nil {
			t.Fatalf("expected directory to exist: %v", err)
		}
		if !info.IsDir() {
			t.Fatal("expected created path to be a directory")
		}
	})

	t.Run("fail when directory already exists", func(t *testing.T) {
		err := fs.CreateDirectory("projects/alpha")
		if err == nil {
			t.Fatal("expected CreateDirectory to fail for existing path")
		}
		if !errors.Is(err, os.ErrExist) {
			t.Fatalf("expected ErrExist, got %v", err)
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
	fs.CreateFile("note-b.md", "content-b")
	fs.CreateFile("note-a.md", "content-a")
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

	t.Run("files are sorted in descending name order", func(t *testing.T) {
		files, err := fs.ListDirectory("")
		if err != nil {
			t.Fatalf("ListDirectory failed: %v", err)
		}

		expectedFiles := []string{"note-b.md", "note-a.md"}
		fileIndex := 0
		for _, f := range files {
			if f.IsDir {
				continue
			}
			if fileIndex >= len(expectedFiles) {
				break
			}
			if f.Name != expectedFiles[fileIndex] {
				t.Fatalf("Expected file at index %d to be %q, got %q", fileIndex, expectedFiles[fileIndex], f.Name)
			}
			fileIndex++
		}

		if fileIndex != len(expectedFiles) {
			t.Fatalf("Expected %d files, got %d", len(expectedFiles), fileIndex)
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

func TestFileService_ListDirectoryTree_DeepNesting(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	if err := fs.CreateFile("level1/level2/level3/level4/deep.md", "# Deep"); err != nil {
		t.Fatalf("setup failed: %v", err)
	}

	files, err := fs.ListDirectoryTree()
	if err != nil {
		t.Fatalf("ListDirectoryTree failed: %v", err)
	}

	if len(files) != 1 || !files[0].IsDir || files[0].Path != "level1" {
		t.Fatalf("unexpected top-level tree: %+v", files)
	}

	level2 := files[0].Children
	if len(level2) != 1 || level2[0].Path != "level1/level2" {
		t.Fatalf("expected level2 folder, got %+v", level2)
	}

	level3 := level2[0].Children
	if len(level3) != 1 || level3[0].Path != "level1/level2/level3" {
		t.Fatalf("expected level3 folder, got %+v", level3)
	}

	level4 := level3[0].Children
	if len(level4) != 1 || level4[0].Path != "level1/level2/level3/level4" {
		t.Fatalf("expected level4 folder, got %+v", level4)
	}

	deepFile := level4[0].Children
	if len(deepFile) != 1 || deepFile[0].Path != "level1/level2/level3/level4/deep.md" {
		t.Fatalf("expected deep file, got %+v", deepFile)
	}
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

func TestFileService_SearchFileContents(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	// Setup test files with content
	fs.WriteFile("note-a.md", "# Note A\n\nThis has some important content.\nAnother line here.\n")
	fs.WriteFile("note-b.md", "# Note B\n\nThis also has Important stuff.\nNothing else.\n")
	fs.WriteFile("folder/note-c.md", "# Note C\n\nCompletely different text.\nimportant discovery.\n")
	fs.WriteFile("no-match.md", "# No Match\n\nNothing relevant here.\n")

	t.Run("basic case-insensitive search", func(t *testing.T) {
		results, err := fs.SearchFileContents("important", 0, false)
		if err != nil {
			t.Fatalf("SearchFileContents failed: %v", err)
		}

		if len(results) != 3 {
			t.Errorf("Expected 3 results, got %d", len(results))
			for _, r := range results {
				t.Logf("  %s:%d %s", r.Path, r.Line, r.Context)
			}
		}
	})

	t.Run("case-sensitive search", func(t *testing.T) {
		results, err := fs.SearchFileContents("Important", 0, true)
		if err != nil {
			t.Fatalf("SearchFileContents failed: %v", err)
		}

		if len(results) != 1 {
			t.Errorf("Expected 1 result for case-sensitive 'Important', got %d", len(results))
			for _, r := range results {
				t.Logf("  %s:%d %s", r.Path, r.Line, r.Context)
			}
		}
	})

	t.Run("search with limit", func(t *testing.T) {
		results, err := fs.SearchFileContents("important", 2, false)
		if err != nil {
			t.Fatalf("SearchFileContents failed: %v", err)
		}

		if len(results) != 2 {
			t.Errorf("Expected 2 results (limited), got %d", len(results))
		}
	})

	t.Run("no results", func(t *testing.T) {
		results, err := fs.SearchFileContents("zzzznotfound", 0, false)
		if err != nil {
			t.Fatalf("SearchFileContents failed: %v", err)
		}

		if len(results) != 0 {
			t.Errorf("Expected 0 results, got %d", len(results))
		}
	})

	t.Run("result has correct fields", func(t *testing.T) {
		results, err := fs.SearchFileContents("important content", 0, false)
		if err != nil {
			t.Fatalf("SearchFileContents failed: %v", err)
		}

		if len(results) != 1 {
			t.Fatalf("Expected 1 result, got %d", len(results))
		}

		r := results[0]
		if r.Path != "note-a.md" {
			t.Errorf("Expected path 'note-a.md', got %q", r.Path)
		}
		if r.Title != "note-a" {
			t.Errorf("Expected title 'note-a', got %q", r.Title)
		}
		if r.Line != 3 {
			t.Errorf("Expected line 3, got %d", r.Line)
		}
		if r.Context != "This has some important content." {
			t.Errorf("Expected context 'This has some important content.', got %q", r.Context)
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

func TestFileService_ResolveImagePath(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	// Setup test structure: vault root images and attachments folder
	os.WriteFile(filepath.Join(tmpDir, "root-image.png"), []byte("PNG"), 0644)
	os.MkdirAll(filepath.Join(tmpDir, "attachments"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "attachments", "attached.jpg"), []byte("JPG"), 0644)
	os.MkdirAll(filepath.Join(tmpDir, "notes"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "notes", "local.png"), []byte("PNG"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "notes", "my-note.md"), []byte("# Note"), 0644)

	t.Run("resolve vault-relative path", func(t *testing.T) {
		resolved, err := fs.ResolveImagePath("root-image.png", "")
		if err != nil {
			t.Fatalf("ResolveImagePath failed: %v", err)
		}
		if resolved != "root-image.png" {
			t.Errorf("Expected 'root-image.png', got %q", resolved)
		}
	})

	t.Run("resolve note-relative path", func(t *testing.T) {
		resolved, err := fs.ResolveImagePath("local.png", "notes/my-note.md")
		if err != nil {
			t.Fatalf("ResolveImagePath failed: %v", err)
		}
		if resolved != "notes/local.png" {
			t.Errorf("Expected 'notes/local.png', got %q", resolved)
		}
	})

	t.Run("resolve attachments folder by convention", func(t *testing.T) {
		resolved, err := fs.ResolveImagePath("attached.jpg", "")
		if err != nil {
			t.Fatalf("ResolveImagePath failed: %v", err)
		}
		if resolved != "attachments/attached.jpg" {
			t.Errorf("Expected 'attachments/attached.jpg', got %q", resolved)
		}
	})

	t.Run("resolve image with explicit subfolder", func(t *testing.T) {
		resolved, err := fs.ResolveImagePath("attachments/attached.jpg", "")
		if err != nil {
			t.Fatalf("ResolveImagePath failed: %v", err)
		}
		if resolved != "attachments/attached.jpg" {
			t.Errorf("Expected 'attachments/attached.jpg', got %q", resolved)
		}
	})

	t.Run("resolve bare filename anywhere in the vault (recursive)", func(t *testing.T) {
		os.MkdirAll(filepath.Join(tmpDir, "attachment", "kimura-scattering"), 0755)
		os.WriteFile(filepath.Join(tmpDir, "attachment", "kimura-scattering", "fig1_geometry_3d.png"), []byte("PNG"), 0644)

		resolved, err := fs.ResolveImagePath("fig1_geometry_3d.png", "03_papers/note.md")
		if err != nil {
			t.Fatalf("ResolveImagePath failed: %v", err)
		}
		if resolved != "attachment/kimura-scattering/fig1_geometry_3d.png" {
			t.Errorf("Expected recursive hit, got %q", resolved)
		}
	})

	t.Run("recursive search skips hidden directories", func(t *testing.T) {
		os.MkdirAll(filepath.Join(tmpDir, ".obsidian"), 0755)
		os.WriteFile(filepath.Join(tmpDir, ".obsidian", "hidden-only.png"), []byte("PNG"), 0644)

		_, err := fs.ResolveImagePath("hidden-only.png", "")
		if err == nil {
			t.Error("Expected error for image only present in hidden directory")
		}
	})

	t.Run("not found returns error", func(t *testing.T) {
		_, err := fs.ResolveImagePath("nonexistent.png", "")
		if err == nil {
			t.Error("Expected error for nonexistent image")
		}
	})

	t.Run("reject path traversal", func(t *testing.T) {
		_, err := fs.ResolveImagePath("../etc/passwd", "")
		if err == nil {
			t.Error("Expected error for path traversal")
		}
	})
}

func TestVaultWatchService_GetRevision(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	watcher := NewVaultWatchService(cs)
	if err := watcher.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer watcher.Stop()

	waitForRevision := func(previous int64) int64 {
		t.Helper()
		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			current := watcher.GetRevision()
			if current > previous {
				return current
			}
			time.Sleep(25 * time.Millisecond)
		}
		t.Fatalf("revision did not advance past %d", previous)
		return previous
	}

	revision := watcher.GetRevision()

	if err := os.WriteFile(filepath.Join(tmpDir, "created.md"), []byte("# created"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	revision = waitForRevision(revision)

	if err := os.Rename(filepath.Join(tmpDir, "created.md"), filepath.Join(tmpDir, "renamed.md")); err != nil {
		t.Fatalf("rename failed: %v", err)
	}
	revision = waitForRevision(revision)

	if err := os.Mkdir(filepath.Join(tmpDir, "nested"), 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}
	revision = waitForRevision(revision)

	if err := os.WriteFile(filepath.Join(tmpDir, "nested", "inside.md"), []byte("# nested"), 0644); err != nil {
		t.Fatalf("nested write failed: %v", err)
	}
	waitForRevision(revision)
}

func TestVaultWatchService_SwitchVaultPath(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	secondVault, err := os.MkdirTemp("", "obails-watch-switch-*")
	if err != nil {
		t.Fatalf("failed to create second vault: %v", err)
	}
	defer os.RemoveAll(secondVault)

	watcher := NewVaultWatchService(cs)
	if err := watcher.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer watcher.Stop()

	waitForRevision := func(previous int64) int64 {
		t.Helper()
		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			current := watcher.GetRevision()
			if current > previous {
				return current
			}
			time.Sleep(25 * time.Millisecond)
		}
		t.Fatalf("revision did not advance past %d", previous)
		return previous
	}

	revision := watcher.GetRevision()
	cs.OverrideVaultPath(secondVault)
	revision = watcher.GetRevision()

	if err := os.WriteFile(filepath.Join(secondVault, "switched.md"), []byte("# switched"), 0644); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	waitForRevision(revision)
}

func TestFileService_ImportExternalFile(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	sourceDir := filepath.Join(tmpDir, "external")
	if err := os.MkdirAll(sourceDir, 0755); err != nil {
		t.Fatalf("setup external dir: %v", err)
	}

	sourcePath := filepath.Join(sourceDir, "import-me.md")
	if err := os.WriteFile(sourcePath, []byte("# Imported"), 0644); err != nil {
		t.Fatalf("setup source file: %v", err)
	}

	t.Run("imports file into vault root", func(t *testing.T) {
		relativePath, err := fs.ImportExternalFile(sourcePath, "")
		if err != nil {
			t.Fatalf("ImportExternalFile() error = %v", err)
		}
		if relativePath != "import-me.md" {
			t.Fatalf("relativePath = %q, want import-me.md", relativePath)
		}

		content, err := fs.ReadFile("import-me.md")
		if err != nil {
			t.Fatalf("ReadFile() error = %v", err)
		}
		if content != "# Imported" {
			t.Fatalf("content = %q, want # Imported", content)
		}
	})

	t.Run("imports file into target folder with unique name", func(t *testing.T) {
		if err := fs.CreateDirectory("docs"); err != nil {
			t.Fatalf("CreateDirectory() error = %v", err)
		}
		if err := os.WriteFile(sourcePath, []byte("# Imported again"), 0644); err != nil {
			t.Fatalf("rewrite source file: %v", err)
		}

		firstPath, err := fs.ImportExternalFile(sourcePath, "docs")
		if err != nil {
			t.Fatalf("first import error = %v", err)
		}
		if firstPath != "docs/import-me.md" {
			t.Fatalf("firstPath = %q, want docs/import-me.md", firstPath)
		}

		secondPath, err := fs.ImportExternalFile(sourcePath, "docs")
		if err != nil {
			t.Fatalf("second import error = %v", err)
		}
		if secondPath != "docs/import-me (1).md" {
			t.Fatalf("secondPath = %q, want docs/import-me (1).md", secondPath)
		}
	})

	t.Run("rejects directories", func(t *testing.T) {
		if _, err := fs.ImportExternalFile(sourceDir, ""); err == nil {
			t.Fatal("expected error importing directory")
		}
	})
}

func TestFileService_RevealInFinder(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	if err := fs.CreateFile("reveal-me.md", "# reveal"); err != nil {
		t.Fatalf("CreateFile() error = %v", err)
	}

	if err := fs.RevealInFinder("reveal-me.md"); err != nil {
		t.Fatalf("RevealInFinder() error = %v", err)
	}
}

func TestFileService_OpenWithDefaultApp(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	if err := fs.CreateFile("open-me.md", "# open"); err != nil {
		t.Fatalf("CreateFile() error = %v", err)
	}

	t.Run("starts open command for existing file", func(t *testing.T) {
		if err := fs.OpenWithDefaultApp("open-me.md"); err != nil {
			t.Fatalf("OpenWithDefaultApp() error = %v", err)
		}
	})

	t.Run("returns error for missing file", func(t *testing.T) {
		if err := fs.OpenWithDefaultApp("missing.md"); err == nil {
			t.Fatal("expected error for missing file")
		}
	})

	t.Run("returns error for path traversal", func(t *testing.T) {
		if err := fs.OpenWithDefaultApp("../outside.md"); err == nil {
			t.Fatal("expected error for path traversal")
		}
	})

	t.Run("returns error for empty path", func(t *testing.T) {
		if err := fs.OpenWithDefaultApp(""); err == nil {
			t.Fatal("expected error for empty path")
		}
	})
}

func TestFileService_GetAbsolutePath(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	if err := fs.CreateFile("notes/abs-me.md", "# abs"); err != nil {
		t.Fatalf("CreateFile() error = %v", err)
	}

	t.Run("returns absolute path for existing file", func(t *testing.T) {
		got, err := fs.GetAbsolutePath("notes/abs-me.md")
		if err != nil {
			t.Fatalf("GetAbsolutePath() error = %v", err)
		}
		want := filepath.Join(tmpDir, "notes", "abs-me.md")
		if got != want {
			t.Fatalf("GetAbsolutePath() = %q, want %q", got, want)
		}
		if !filepath.IsAbs(got) {
			t.Fatalf("GetAbsolutePath() = %q, expected absolute path", got)
		}
	})

	t.Run("returns absolute path for directory", func(t *testing.T) {
		got, err := fs.GetAbsolutePath("notes")
		if err != nil {
			t.Fatalf("GetAbsolutePath() error = %v", err)
		}
		want := filepath.Join(tmpDir, "notes")
		if got != want {
			t.Fatalf("GetAbsolutePath() = %q, want %q", got, want)
		}
	})

	t.Run("returns error for missing file", func(t *testing.T) {
		if _, err := fs.GetAbsolutePath("missing.md"); err == nil {
			t.Fatal("expected error for missing file")
		}
	})

	t.Run("returns error for path traversal", func(t *testing.T) {
		if _, err := fs.GetAbsolutePath("../outside.md"); err == nil {
			t.Fatal("expected error for path traversal")
		}
	})
}
