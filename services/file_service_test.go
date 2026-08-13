package services

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/kazuph/obails/models"
)

// mockConfigService creates a ConfigService with a temporary vault path for testing
func newTestConfigService(t *testing.T) (*ConfigService, string) {
	t.Helper()
	rootDir, err := os.MkdirTemp("", "obails-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	tmpDir := filepath.Join(rootDir, "vault")
	if err := os.MkdirAll(tmpDir, 0755); err != nil {
		os.RemoveAll(rootDir)
		t.Fatalf("Failed to create temp vault: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(rootDir) })

	cs := &ConfigService{
		configPath: filepath.Join(rootDir, "config", "config.toml"),
		configDir:  filepath.Join(rootDir, "config"),
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

	t.Run("create empty note as zero-byte file", func(t *testing.T) {
		if err := fs.CreateFile("Empty Note.md", ""); err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}

		info, err := os.Stat(filepath.Join(tmpDir, "Empty Note.md"))
		if err != nil {
			t.Fatalf("Stat failed: %v", err)
		}
		if info.Size() != 0 {
			t.Fatalf("Expected zero-byte note, got %d bytes", info.Size())
		}

		content, err := fs.ReadFile("Empty Note.md")
		if err != nil {
			t.Fatalf("ReadFile failed: %v", err)
		}
		if content != "" {
			t.Errorf("Expected empty content, got %q", content)
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

func TestFileService_TrashPathDoesNotFallBackToPermanentDelete(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)
	t.Setenv("PATH", "")

	fs := NewFileService(cs)
	if err := fs.CreateFile("keep-me.md", "important"); err != nil {
		t.Fatalf("Setup failed: %v", err)
	}

	if err := fs.TrashPath("keep-me.md"); err == nil {
		t.Fatal("expected TrashPath to fail when trash command is unavailable")
	}
	if !fs.FileExists("keep-me.md") {
		t.Fatal("TrashPath must not permanently delete when trash command is unavailable")
	}
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

	t.Run("fail to move directory into itself or descendant", func(t *testing.T) {
		if err := fs.CreateDirectory("parent"); err != nil {
			t.Fatalf("setup parent: %v", err)
		}
		if err := fs.CreateDirectory("parent/child"); err != nil {
			t.Fatalf("setup child: %v", err)
		}

		if err := fs.MoveFile("parent", "parent"); err == nil {
			t.Fatal("MoveFile into self should fail")
		}
		if err := fs.MoveFile("parent", "parent/child/parent"); err == nil {
			t.Fatal("MoveFile into descendant should fail")
		}
		if fs.FileExists("parent/child/parent") {
			t.Fatal("descendant move should not create nested folder")
		}
	})

	t.Run("updates renderable vault links when moving a folder", func(t *testing.T) {
		if err := fs.CreateFile("old/Target Note.md", "# Target"); err != nil {
			t.Fatalf("target setup failed: %v", err)
		}
		if err := fs.CreateFile("old/image one.png", "image"); err != nil {
			t.Fatalf("attachment setup failed: %v", err)
		}
		if err := fs.CreateFile("old/relative.markdown", "[Target](Target%20Note.md#Heading%20one)\n![Image](image%20one.png)"); err != nil {
			t.Fatalf("relative source setup failed: %v", err)
		}
		content := "[[old/Target Note#Heading|Keep alias]]\n[[Target Note#^block-1|Keep block alias]]\n[Markdown label](old/Target%20Note.md#Heading%20one)\n![Attachment label](old/image%20one.png#preview)\n`[[old/Target Note]] [code](old/Target%20Note.md)`\n```md\n[[old/Target Note]]\n[code](old/Target%20Note.md)\n```"
		if err := fs.CreateFile("source.md", content); err != nil {
			t.Fatalf("source setup failed: %v", err)
		}

		if err := fs.MoveFile("old", "archive"); err != nil {
			t.Fatalf("MoveFile folder failed: %v", err)
		}

		got, err := fs.ReadFile("source.md")
		if err != nil {
			t.Fatalf("read rewritten source failed: %v", err)
		}
		want := "[[archive/Target Note#Heading|Keep alias]]\n[[Target Note#^block-1|Keep block alias]]\n[Markdown label](archive/Target%20Note.md#Heading%20one)\n![Attachment label](archive/image%20one.png#preview)\n`[[old/Target Note]] [code](old/Target%20Note.md)`\n```md\n[[old/Target Note]]\n[code](old/Target%20Note.md)\n```"
		if got != want {
			t.Errorf("source links after folder move = %q, want %q", got, want)
		}

		relative, err := fs.ReadFile("archive/relative.markdown")
		if err != nil {
			t.Fatalf("read moved markdown source failed: %v", err)
		}
		if relative != "[Target](Target%20Note.md#Heading%20one)\n![Image](image%20one.png)" {
			t.Errorf("relative links in moved Markdown must remain relative and encoded, got %q", relative)
		}
	})

	t.Run("updates basename and path links when renaming a file", func(t *testing.T) {
		if err := fs.CreateFile("notes/Old Name.md", "# Target"); err != nil {
			t.Fatalf("target setup failed: %v", err)
		}
		content := "[[Old Name#Heading|Alias]]\n[[notes/Old Name#^block-id]]\n[Label](notes/Old%20Name.md#Heading%20one)"
		if err := fs.CreateFile("links.md", content); err != nil {
			t.Fatalf("source setup failed: %v", err)
		}

		if err := fs.MoveFile("notes/Old Name.md", "archive/New Name.md"); err != nil {
			t.Fatalf("MoveFile rename failed: %v", err)
		}

		got, err := fs.ReadFile("links.md")
		if err != nil {
			t.Fatalf("read rewritten source failed: %v", err)
		}
		want := "[[New Name#Heading|Alias]]\n[[archive/New Name#^block-id]]\n[Label](archive/New%20Name.md#Heading%20one)"
		if got != want {
			t.Errorf("source links after file rename = %q, want %q", got, want)
		}

		linkService := NewLinkService(fs, cs)
		if err := linkService.RebuildIndex(); err != nil {
			t.Fatalf("rebuild after rename failed: %v", err)
		}
		links, err := linkService.GetLinkInfo("links.md")
		if err != nil {
			t.Fatalf("read links after rename failed: %v", err)
		}
		for _, link := range links {
			if !link.Exists || link.TargetPath != "archive/New Name.md" {
				t.Errorf("rewritten link must resolve after rebuild, got %#v", link)
			}
		}
	})

	t.Run("qualifies a bare wiki link when moving changes its basename winner", func(t *testing.T) {
		if err := fs.CreateFile("a/Identity Note.md", "# First winner"); err != nil {
			t.Fatalf("first target setup failed: %v", err)
		}
		if err := fs.CreateFile("z/Identity Note.md", "# Later winner"); err != nil {
			t.Fatalf("second target setup failed: %v", err)
		}
		if err := fs.CreateFile("identity-source.md", "[[Identity Note]]"); err != nil {
			t.Fatalf("source setup failed: %v", err)
		}

		if err := fs.MoveFile("a/Identity Note.md", "zz/Identity Note.md"); err != nil {
			t.Fatalf("MoveFile basename-winner change failed: %v", err)
		}

		content, err := fs.ReadFile("identity-source.md")
		if err != nil {
			t.Fatalf("read rewritten bare wiki link failed: %v", err)
		}
		if content != "[[zz/Identity Note]]" {
			t.Errorf("bare wiki link must become path-qualified when its winner changes, got %q", content)
		}

		linkService := NewLinkService(fs, cs)
		if err := linkService.RebuildIndex(); err != nil {
			t.Fatalf("rebuild after basename-winner change failed: %v", err)
		}
		links, err := linkService.GetLinkInfo("identity-source.md")
		if err != nil || len(links) != 1 || !links[0].Exists || links[0].TargetPath != "zz/Identity Note.md" {
			t.Fatalf("rewritten bare link must retain target identity: links=%#v err=%v", links, err)
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

	t.Run("directory listing keeps the filesystem's stable ascending name order", func(t *testing.T) {
		files, err := fs.ListDirectory("")
		if err != nil {
			t.Fatalf("ListDirectory failed: %v", err)
		}

		expectedFiles := []string{"note-a.md", "note-b.md"}
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

func TestFileService_SaveIfUnchanged(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	t.Run("saves a fresh editable file", func(t *testing.T) {
		if err := fs.CreateFile("editable.txt", "original"); err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}
		originalInfo, err := os.Stat(filepath.Join(tmpDir, "editable.txt"))
		if err != nil {
			t.Fatalf("Stat failed: %v", err)
		}
		snapshot, err := fs.ReadSnapshot("editable.txt")
		if err != nil {
			t.Fatalf("ReadSnapshot failed: %v", err)
		}

		result, err := fs.SaveIfUnchanged(snapshot, "updated")
		if err != nil {
			t.Fatalf("SaveIfUnchanged failed: %v", err)
		}
		if result.Status != models.FileSaveStatusSaved || result.Snapshot == nil {
			t.Fatalf("Expected saved result with snapshot, got %+v", result)
		}
		if result.Snapshot.Path != "editable.txt" || result.Snapshot.Content != "updated" || result.Snapshot.Revision == snapshot.Revision {
			t.Errorf("Unexpected updated snapshot: %+v", result.Snapshot)
		}
		updatedInfo, err := os.Stat(filepath.Join(tmpDir, "editable.txt"))
		if err != nil {
			t.Fatalf("Stat after save failed: %v", err)
		}
		if os.SameFile(originalInfo, updatedInfo) {
			t.Error("CAS save must atomically replace the original file")
		}
	})

	t.Run("rejects an externally changed file", func(t *testing.T) {
		if err := fs.CreateFile("changed.html", "original"); err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}
		snapshot, err := fs.ReadSnapshot("changed.html")
		if err != nil {
			t.Fatalf("ReadSnapshot failed: %v", err)
		}
		if err := os.WriteFile(filepath.Join(tmpDir, "changed.html"), []byte("external"), 0644); err != nil {
			t.Fatalf("External write failed: %v", err)
		}

		result, err := fs.SaveIfUnchanged(snapshot, "local edit")
		if err != nil {
			t.Fatalf("SaveIfUnchanged failed: %v", err)
		}
		if result.Status != models.FileSaveStatusConflict || result.Snapshot == nil || result.Snapshot.Content != "external" {
			t.Fatalf("Expected external content conflict, got %+v", result)
		}
		content, err := fs.ReadFile("changed.html")
		if err != nil || content != "external" {
			t.Errorf("External content was overwritten: content=%q err=%v", content, err)
		}
	})

	t.Run("does not recreate an externally deleted path or parent directory", func(t *testing.T) {
		if err := fs.CreateFile("deleted/note.md", "original"); err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}
		snapshot, err := fs.ReadSnapshot("deleted/note.md")
		if err != nil {
			t.Fatalf("ReadSnapshot failed: %v", err)
		}
		if err := os.Remove(filepath.Join(tmpDir, "deleted", "note.md")); err != nil {
			t.Fatalf("External deletion failed: %v", err)
		}
		if err := os.Remove(filepath.Join(tmpDir, "deleted")); err != nil {
			t.Fatalf("External directory deletion failed: %v", err)
		}

		result, err := fs.SaveIfUnchanged(snapshot, "local edit")
		if err != nil {
			t.Fatalf("SaveIfUnchanged failed: %v", err)
		}
		if result.Status != models.FileSaveStatusMissing {
			t.Fatalf("Expected missing result, got %+v", result)
		}
		if _, err := os.Stat(filepath.Join(tmpDir, "deleted")); !os.IsNotExist(err) {
			t.Errorf("CAS recreated deleted directory: %v", err)
		}
	})

	t.Run("does not revive the old path after an external rename", func(t *testing.T) {
		if err := fs.CreateFile("old-name.md", "original"); err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}
		snapshot, err := fs.ReadSnapshot("old-name.md")
		if err != nil {
			t.Fatalf("ReadSnapshot failed: %v", err)
		}
		if err := os.Rename(filepath.Join(tmpDir, "old-name.md"), filepath.Join(tmpDir, "renamed.md")); err != nil {
			t.Fatalf("External rename failed: %v", err)
		}

		result, err := fs.SaveIfUnchanged(snapshot, "local edit")
		if err != nil {
			t.Fatalf("SaveIfUnchanged failed: %v", err)
		}
		if result.Status != models.FileSaveStatusMissing {
			t.Fatalf("Expected missing result, got %+v", result)
		}
		if _, err := os.Stat(filepath.Join(tmpDir, "old-name.md")); !os.IsNotExist(err) {
			t.Errorf("CAS revived old path: %v", err)
		}
		content, err := fs.ReadFile("renamed.md")
		if err != nil || content != "original" {
			t.Errorf("Renamed file changed: content=%q err=%v", content, err)
		}
	})
}

func TestFileService_SaveIfUnchangedSerializesWithWriteFile(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	if err := fs.CreateFile("concurrent.txt", "original"); err != nil {
		t.Fatalf("CreateFile failed: %v", err)
	}
	snapshot, err := fs.ReadSnapshot("concurrent.txt")
	if err != nil {
		t.Fatalf("ReadSnapshot failed: %v", err)
	}

	start := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(2)
	type casOutcome struct {
		result models.FileSaveResult
		err    error
	}
	casOutcomes := make(chan casOutcome, 1)
	writeErrors := make(chan error, 1)
	go func() {
		defer wg.Done()
		<-start
		result, err := fs.SaveIfUnchanged(snapshot, "cas edit")
		casOutcomes <- casOutcome{result: result, err: err}
	}()
	go func() {
		defer wg.Done()
		<-start
		writeErrors <- fs.WriteFile("concurrent.txt", "direct edit")
	}()
	close(start)
	wg.Wait()

	if err := <-writeErrors; err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}
	outcome := <-casOutcomes
	if outcome.err != nil {
		t.Fatalf("SaveIfUnchanged failed: %v", outcome.err)
	}
	result := outcome.result
	content, err := fs.ReadFile("concurrent.txt")
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	if result.Status == models.FileSaveStatusConflict && content != "direct edit" {
		t.Fatalf("Conflict must preserve direct write, got %q", content)
	}
	if result.Status == models.FileSaveStatusSaved && content != "cas edit" && content != "direct edit" {
		t.Fatalf("Serialized writes produced unexpected content %q", content)
	}
	if result.Status != models.FileSaveStatusSaved && result.Status != models.FileSaveStatusConflict {
		t.Fatalf("Unexpected CAS result: %+v", result)
	}
}

func TestFileService_EditableFileIdentityAndSymlinkBoundary(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	t.Run("preserves leading and trailing whitespace in a filename", func(t *testing.T) {
		const filename = " note .txt "
		if err := fs.WriteFile(filename, "original"); err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}
		snapshot, err := fs.ReadSnapshot(filename)
		if err != nil {
			t.Fatalf("ReadSnapshot failed: %v", err)
		}
		if snapshot.Path != filename {
			t.Fatalf("Snapshot changed file identity from %q to %q", filename, snapshot.Path)
		}
		result, err := fs.SaveIfUnchanged(snapshot, "updated")
		if err != nil || result.Status != models.FileSaveStatusSaved {
			t.Fatalf("SaveIfUnchanged result=%+v err=%v", result, err)
		}
		if _, err := fs.ReadSnapshot("./" + filename); !errors.Is(err, ErrInvalidPath) {
			t.Errorf("Expected non-canonical path rejection, got %v", err)
		}
	})

	t.Run("rejects vault-external symlink targets", func(t *testing.T) {
		outsideDir, err := os.MkdirTemp("", "obails-outside-vault-*")
		if err != nil {
			t.Fatalf("MkdirTemp failed: %v", err)
		}
		defer os.RemoveAll(outsideDir)
		if err := os.WriteFile(filepath.Join(outsideDir, "escape.txt"), []byte("outside"), 0644); err != nil {
			t.Fatalf("Outside file setup failed: %v", err)
		}
		if err := os.Symlink(outsideDir, filepath.Join(tmpDir, "outside-link")); err != nil {
			t.Fatalf("Symlink setup failed: %v", err)
		}

		if _, err := fs.ReadSnapshot("outside-link/escape.txt"); !errors.Is(err, ErrInvalidPath) {
			t.Errorf("ReadSnapshot accepted outside symlink: %v", err)
		}
		if err := fs.WriteFile("outside-link/new.txt", "must not escape"); !errors.Is(err, ErrInvalidPath) {
			t.Errorf("WriteFile accepted outside symlink: %v", err)
		}
		if _, err := os.Stat(filepath.Join(outsideDir, "new.txt")); !os.IsNotExist(err) {
			t.Errorf("WriteFile created an outside file: %v", err)
		}

		if err := fs.CreateFile("replaceable/note.txt", "original"); err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}
		snapshot, err := fs.ReadSnapshot("replaceable/note.txt")
		if err != nil {
			t.Fatalf("ReadSnapshot failed: %v", err)
		}
		if err := os.Remove(filepath.Join(tmpDir, "replaceable", "note.txt")); err != nil {
			t.Fatalf("Remove file failed: %v", err)
		}
		if err := os.Remove(filepath.Join(tmpDir, "replaceable")); err != nil {
			t.Fatalf("Remove directory failed: %v", err)
		}
		if err := os.Symlink(outsideDir, filepath.Join(tmpDir, "replaceable")); err != nil {
			t.Fatalf("Replacement symlink setup failed: %v", err)
		}
		if _, err := fs.SaveIfUnchanged(snapshot, "must not escape"); !errors.Is(err, ErrInvalidPath) {
			t.Errorf("SaveIfUnchanged accepted replacement symlink: %v", err)
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

	t.Run("reports a file collision without overwriting", func(t *testing.T) {
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

		if _, err := fs.ImportExternalFile(sourcePath, "docs"); !errors.Is(err, os.ErrExist) {
			t.Fatalf("second import error = %v, want os.ErrExist", err)
		}
		content, err := fs.ReadFile(firstPath)
		if err != nil || content != "# Imported again" {
			t.Fatalf("existing vault file changed after collision: content=%q err=%v", content, err)
		}
	})

	t.Run("rejects directories", func(t *testing.T) {
		if _, err := fs.ImportExternalFile(sourceDir, ""); err == nil {
			t.Fatal("expected error importing directory")
		}
	})
}

func TestFileService_ImportAttachment(t *testing.T) {
	cs, vaultPath := newTestConfigService(t)
	fs := NewFileService(cs)
	sourceDir := t.TempDir()

	writeSource := func(t *testing.T, name string, content []byte) string {
		t.Helper()
		path := filepath.Join(sourceDir, name)
		if err := os.WriteFile(path, content, 0644); err != nil {
			t.Fatalf("write source %q: %v", name, err)
		}
		return path
	}
	assertImport := func(t *testing.T, config models.AttachmentConfig, notePath, sourcePath, wantPath string, wantBytes []byte) models.AttachmentImportResult {
		t.Helper()
		if err := cs.SetAttachmentConfig(config); err != nil {
			t.Fatalf("SetAttachmentConfig(%#v): %v", config, err)
		}
		result, err := fs.ImportAttachment(sourcePath, notePath)
		if err != nil {
			t.Fatalf("ImportAttachment(%q, %q): %v", sourcePath, notePath, err)
		}
		if result.DestinationPath != wantPath {
			t.Fatalf("destination = %q, want %q", result.DestinationPath, wantPath)
		}
		if result.Embed != "![["+encodeLinkPath(wantPath)+"]]" {
			t.Fatalf("embed = %q", result.Embed)
		}
		gotBytes, err := os.ReadFile(filepath.Join(vaultPath, filepath.FromSlash(wantPath)))
		if err != nil {
			t.Fatalf("read imported attachment: %v", err)
		}
		if string(gotBytes) != string(wantBytes) {
			t.Fatalf("imported bytes = %v, want %v", gotBytes, wantBytes)
		}
		return result
	}

	if err := fs.CreateFile("root.md", "# Root"); err != nil {
		t.Fatalf("create root note: %v", err)
	}
	if err := fs.CreateFile("notes/project/current.md", "# Current"); err != nil {
		t.Fatalf("create current note: %v", err)
	}
	if err := fs.CreateFile("notes/project/alternate.markdown", "# Alternate"); err != nil {
		t.Fatalf("create markdown note: %v", err)
	}

	rootBytes := []byte{0, 1, 2, 255}
	_ = assertImport(t, models.AttachmentConfig{Location: models.AttachmentLocationVaultRoot}, "root.md", writeSource(t, "root.bin", rootBytes), "root.bin", rootBytes)

	vaultFolderBytes := []byte{3, 4, 5, 254}
	_ = assertImport(t, models.AttachmentConfig{Location: models.AttachmentLocationVaultFolder, Folder: "attachments/shared"}, "root.md", writeSource(t, "vault-folder.bin", vaultFolderBytes), "attachments/shared/vault-folder.bin", vaultFolderBytes)

	currentBytes := []byte{6, 7, 8, 253}
	_ = assertImport(t, models.AttachmentConfig{Location: models.AttachmentLocationCurrentFolder}, "notes/project/current.md", writeSource(t, "current-folder.bin", currentBytes), "notes/project/current-folder.bin", currentBytes)

	subfolderBytes := []byte{9, 10, 11, 252}
	subfolderPath := "notes/project/media/subfolder.bin"
	_ = assertImport(t, models.AttachmentConfig{Location: models.AttachmentLocationCurrentSubfolder, Folder: "media"}, "notes/project/alternate.markdown", writeSource(t, "subfolder.bin", subfolderBytes), subfolderPath, subfolderBytes)
	if info, err := os.Stat(filepath.Join(vaultPath, "notes", "project", "media")); err != nil || !info.IsDir() {
		t.Fatalf("current-note subfolder was not created: info=%v err=%v", info, err)
	}

	specialBytes := []byte{12, 13, 14, 251}
	specialName := "photo #1 |[draft].png"
	specialPath := "attachments/日本語 folder/" + specialName
	specialResult := assertImport(t, models.AttachmentConfig{Location: models.AttachmentLocationVaultFolder, Folder: "attachments/日本語 folder"}, "root.md", writeSource(t, specialName, specialBytes), specialPath, specialBytes)
	if wantEmbed := "![[attachments/%E6%97%A5%E6%9C%AC%E8%AA%9E%20folder/photo%20%231%20%7C%5Bdraft%5D.png]]"; specialResult.Embed != wantEmbed {
		t.Fatalf("encoded special embed = %q, want %q", specialResult.Embed, wantEmbed)
	}
	if err := fs.WriteFile("root.md", specialResult.Embed); err != nil {
		t.Fatalf("write special embed: %v", err)
	}
	linkService := NewLinkService(fs, cs)
	if err := linkService.RebuildIndex(); err != nil {
		t.Fatalf("rebuild special embed index: %v", err)
	}
	links, err := linkService.GetLinkInfo("root.md")
	if err != nil {
		t.Fatalf("read special embed link info: %v", err)
	}
	if len(links) != 1 || !links[0].Exists || links[0].TargetPath != specialResult.DestinationPath {
		t.Fatalf("special embed link = %#v, want resolved %q", links, specialResult.DestinationPath)
	}
	if folder, err := fs.attachmentDestinationFolder(models.AttachmentConfig{Location: models.AttachmentLocationVaultFolder, Folder: "attachments/日本語 folder"}, "root.md"); err != nil || folder != "attachments/日本語 folder" {
		t.Fatalf("attachment destination resolver = %q, %v", folder, err)
	}

	collisionSource := writeSource(t, "collision.bin", []byte("source"))
	if err := os.WriteFile(filepath.Join(vaultPath, "collision.bin"), []byte("existing"), 0644); err != nil {
		t.Fatalf("write collision target: %v", err)
	}
	if err := cs.SetAttachmentConfig(models.AttachmentConfig{Location: models.AttachmentLocationVaultRoot}); err != nil {
		t.Fatalf("set root attachment config: %v", err)
	}
	if _, err := fs.ImportAttachment(collisionSource, "root.md"); !errors.Is(err, os.ErrExist) {
		t.Fatalf("collision import error = %v, want os.ErrExist", err)
	}
	if bytes, err := os.ReadFile(filepath.Join(vaultPath, "collision.bin")); err != nil || string(bytes) != "existing" {
		t.Fatalf("collision changed destination: bytes=%q err=%v", bytes, err)
	}

	if _, err := fs.ImportAttachment(sourceDir, "root.md"); err == nil {
		t.Fatal("ImportAttachment accepted a source directory")
	}
	if _, err := fs.ImportAttachment(filepath.Join(sourceDir, "missing.bin"), "root.md"); err == nil {
		t.Fatal("ImportAttachment accepted a missing source")
	}
	if _, err := fs.ImportAttachment(rootBytesPath(t, writeSource, "not-a-note.bin"), "missing.md"); err == nil {
		t.Fatal("ImportAttachment accepted a missing note")
	}
	if err := fs.CreateFile("not-a-note.txt", "plain text"); err != nil {
		t.Fatalf("create text file: %v", err)
	}
	if _, err := fs.ImportAttachment(rootBytesPath(t, writeSource, "not-a-note-target.bin"), "not-a-note.txt"); err == nil {
		t.Fatal("ImportAttachment accepted a non-Markdown note")
	}
	if err := fs.CreateDirectory("directory.md"); err != nil {
		t.Fatalf("create Markdown-named directory: %v", err)
	}
	if _, err := fs.ImportAttachment(rootBytesPath(t, writeSource, "directory-target.bin"), "directory.md"); err == nil {
		t.Fatal("ImportAttachment accepted a directory note")
	}

	outsidePath := t.TempDir()
	if err := os.Symlink(outsidePath, filepath.Join(vaultPath, "escape")); err != nil {
		t.Fatalf("create outside symlink: %v", err)
	}
	cs.config.Attachment = models.AttachmentConfig{Location: models.AttachmentLocationVaultFolder, Folder: "escape"}
	if _, err := fs.ImportAttachment(rootBytesPath(t, writeSource, "outside.bin"), "root.md"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("outside symlink import error = %v, want ErrInvalidPath", err)
	}
	if _, err := os.Stat(filepath.Join(outsidePath, "outside.bin")); !os.IsNotExist(err) {
		t.Fatalf("outside symlink import created a file: %v", err)
	}
}

func TestCopyExternalFileRemovesAnIncompleteDestination(t *testing.T) {
	tempDir := t.TempDir()
	destination := filepath.Join(tempDir, "incomplete.bin")

	if err := copyExternalFile(tempDir, destination); err == nil {
		t.Fatal("copyExternalFile accepted a directory as file content")
	}
	if _, err := os.Lstat(destination); !os.IsNotExist(err) {
		t.Fatalf("failed copy left a destination behind: %v", err)
	}
}

func rootBytesPath(t *testing.T, writeSource func(*testing.T, string, []byte) string, name string) string {
	t.Helper()
	return writeSource(t, name, []byte("source"))
}

func TestFileService_ImportExternalFolder(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)
	fs := NewFileService(cs)

	source := filepath.Join(tmpDir, "external-folder")
	if err := os.MkdirAll(filepath.Join(source, "nested"), 0755); err != nil {
		t.Fatalf("source setup: %v", err)
	}
	if err := os.WriteFile(filepath.Join(source, "nested", "new.md"), []byte("new"), 0644); err != nil {
		t.Fatalf("source file setup: %v", err)
	}
	if err := os.WriteFile(filepath.Join(source, "keep.md"), []byte("source"), 0644); err != nil {
		t.Fatalf("source collision setup: %v", err)
	}
	if err := fs.CreateFile("imports/external-folder/keep.md", "vault"); err != nil {
		t.Fatalf("vault collision setup: %v", err)
	}

	outcomes, err := fs.ImportExternalFolder(source, "imports")
	if err != nil {
		t.Fatalf("ImportExternalFolder() error = %v", err)
	}
	statuses := map[string]string{}
	for _, outcome := range outcomes {
		statuses[outcome.DestinationPath] = string(outcome.Status)
	}
	if statuses["imports/external-folder/keep.md"] != "collision" {
		t.Fatalf("collision outcome = %q", statuses["imports/external-folder/keep.md"])
	}
	if statuses["imports/external-folder/nested/new.md"] != "imported" {
		t.Fatalf("nested import outcome = %q", statuses["imports/external-folder/nested/new.md"])
	}
	content, err := fs.ReadFile("imports/external-folder/keep.md")
	if err != nil || content != "vault" {
		t.Fatalf("collision overwrote vault file: content=%q err=%v", content, err)
	}
}

func TestFileService_ImportExternalFolder_BinarySafeRecursive(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)
	fs := NewFileService(cs)

	source := filepath.Join(tmpDir, "binary-import")
	nested := filepath.Join(source, "nested")
	if err := os.MkdirAll(nested, 0755); err != nil {
		t.Fatalf("source setup: %v", err)
	}
	binaryPayload := []byte{0x00, 0x01, 0xFF, 0xFE, 0x7F, 0x80, 0x00}
	if err := os.WriteFile(filepath.Join(nested, "clip.bin"), binaryPayload, 0644); err != nil {
		t.Fatalf("binary source setup: %v", err)
	}

	outcomes, err := fs.ImportExternalFolder(source, "imports")
	if err != nil {
		t.Fatalf("ImportExternalFolder() error = %v", err)
	}
	imported := false
	for _, outcome := range outcomes {
		if outcome.DestinationPath == "imports/binary-import/nested/clip.bin" && outcome.Status == models.ImportStatusImported {
			imported = true
		}
	}
	if !imported {
		t.Fatalf("binary file was not imported: %#v", outcomes)
	}

	destination := filepath.Join(cs.GetVaultPath(), "imports", "binary-import", "nested", "clip.bin")
	got, err := os.ReadFile(destination)
	if err != nil {
		t.Fatalf("ReadFile imported binary: %v", err)
	}
	if !bytes.Equal(got, binaryPayload) {
		t.Fatalf("imported bytes = %v, want %v", got, binaryPayload)
	}
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
	resolvedVault, err := filepath.EvalSymlinks(tmpDir)
	if err != nil {
		t.Fatalf("EvalSymlinks() error = %v", err)
	}

	fs := NewFileService(cs)
	if err := fs.CreateFile("notes/abs-me.md", "# abs"); err != nil {
		t.Fatalf("CreateFile() error = %v", err)
	}

	t.Run("returns absolute path for existing file", func(t *testing.T) {
		got, err := fs.GetAbsolutePath("notes/abs-me.md")
		if err != nil {
			t.Fatalf("GetAbsolutePath() error = %v", err)
		}
		want := filepath.Join(resolvedVault, "notes", "abs-me.md")
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
		want := filepath.Join(resolvedVault, "notes")
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
