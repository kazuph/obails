package services

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/kazuph/obails/models"
)

func TestFileService_DeletePolicy(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)

	t.Run("default system trash fails closed without permanently deleting", func(t *testing.T) {
		t.Setenv("PATH", "")
		if err := fs.CreateFile("default.md", "keep me"); err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}

		if err := fs.Delete("default.md"); err == nil {
			t.Fatal("Expected system trash to fail without trash command")
		}
		if !fs.FileExists("default.md") {
			t.Fatal("Default deletion must not fall back to permanent deletion")
		}
		if items, err := fs.ListRecentlyDeleted(); err != nil || len(items) != 0 {
			t.Fatalf("failed deletion must not retain a recovery record after rollback: %#v, %v", items, err)
		}
	})

	t.Run("permanent deletion keeps an external replacement and records the staged inode", func(t *testing.T) {
		cs.config.Vault.DeleteMode = models.DeleteModePermanent
		if err := fs.CreateFile("identity.md", "original inode"); err != nil {
			t.Fatalf("CreateFile: %v", err)
		}
		fs.afterDeleteStage = func() {
			if err := os.WriteFile(filepath.Join(tmpDir, "identity.md"), []byte("external replacement"), 0644); err != nil {
				t.Fatalf("external replacement: %v", err)
			}
		}
		defer func() { fs.afterDeleteStage = nil }()

		if err := fs.Delete("identity.md"); err != nil {
			t.Fatalf("Delete: %v", err)
		}
		if got, err := fs.ReadFile("identity.md"); err != nil || got != "external replacement" {
			t.Fatalf("external replacement = %q, %v", got, err)
		}
		items, err := fs.ListRecentlyDeleted()
		if err != nil {
			t.Fatalf("ListRecentlyDeleted: %v", err)
		}
		var item models.RecentlyDeletedItem
		for _, candidate := range items {
			if candidate.Path == "identity.md" {
				item = candidate
				break
			}
		}
		if item.ID == "" {
			t.Fatalf("missing recovery record for staged inode: %#v", items)
		}
		storage, err := fs.recoveryStorage()
		if err != nil {
			t.Fatalf("recoveryStorage: %v", err)
		}
		content, err := os.ReadFile(filepath.Join(storage.recent, item.ID, "contents"))
		if err != nil || string(content) != "original inode" {
			t.Fatalf("recovery record = %q, %v", content, err)
		}
	})

	t.Run("vault trash preserves file and directory relative paths", func(t *testing.T) {
		cs.config.Vault.DeleteMode = models.DeleteModeVaultTrash
		if err := fs.CreateFile("notes/draft.md", "draft"); err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}
		if err := fs.Delete("notes/draft.md"); err != nil {
			t.Fatalf("Delete file failed: %v", err)
		}
		content, err := fs.ReadFile(".trash/notes/draft.md")
		if err != nil || content != "draft" {
			t.Fatalf("Vault trash did not preserve file content: content=%q err=%v", content, err)
		}
		if fs.FileExists("notes/draft.md") {
			t.Fatal("Source file still exists after vault trash")
		}

		if err := fs.CreateFile("folder/item.md", "item"); err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}
		if err := fs.Delete("folder"); err != nil {
			t.Fatalf("Delete directory failed: %v", err)
		}
		content, err = fs.ReadFile(".trash/folder/item.md")
		if err != nil || content != "item" {
			t.Fatalf("Vault trash did not preserve directory content: content=%q err=%v", content, err)
		}
		if fs.FileExists("folder") {
			t.Fatal("Source directory still exists after vault trash")
		}
	})

	t.Run("vault trash rejects collisions without overwriting", func(t *testing.T) {
		if err := fs.CreateFile("collision.md", "source"); err != nil {
			t.Fatalf("CreateFile source failed: %v", err)
		}
		if err := fs.CreateFile(".trash/collision.md", "existing"); err != nil {
			t.Fatalf("CreateFile trash collision failed: %v", err)
		}

		if err := fs.Delete("collision.md"); !errors.Is(err, os.ErrExist) {
			t.Fatalf("Expected collision error, got %v", err)
		}
		source, err := fs.ReadFile("collision.md")
		if err != nil || source != "source" {
			t.Fatalf("Collision changed source: content=%q err=%v", source, err)
		}
		trash, err := fs.ReadFile(".trash/collision.md")
		if err != nil || trash != "existing" {
			t.Fatalf("Collision overwrote trash file: content=%q err=%v", trash, err)
		}
	})

	t.Run("permanent deletion requires explicit mode", func(t *testing.T) {
		cs.config.Vault.DeleteMode = models.DeleteModePermanent
		if err := fs.CreateFile("permanent.md", "remove me"); err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}
		if err := fs.Delete("permanent.md"); err != nil {
			t.Fatalf("Delete failed: %v", err)
		}
		if fs.FileExists("permanent.md") {
			t.Fatal("Explicit permanent deletion did not remove file")
		}
	})

	t.Run("invalid mode leaves the source untouched", func(t *testing.T) {
		cs.config.Vault.DeleteMode = models.DeleteMode("invalid")
		if err := fs.CreateFile("invalid-mode.md", "keep me"); err != nil {
			t.Fatalf("CreateFile failed: %v", err)
		}
		if err := fs.Delete("invalid-mode.md"); err == nil {
			t.Fatal("Expected invalid delete mode error")
		}
		if !fs.FileExists("invalid-mode.md") {
			t.Fatal("Invalid delete mode must not delete the source")
		}
	})

	t.Run("vault trash rejects paths through an outside symlink", func(t *testing.T) {
		cs.config.Vault.DeleteMode = models.DeleteModeVaultTrash
		outsideDir, err := os.MkdirTemp("", "obails-delete-outside-*")
		if err != nil {
			t.Fatalf("MkdirTemp failed: %v", err)
		}
		defer os.RemoveAll(outsideDir)
		outsidePath := filepath.Join(outsideDir, "outside.md")
		if err := os.WriteFile(outsidePath, []byte("outside"), 0644); err != nil {
			t.Fatalf("Outside setup failed: %v", err)
		}
		if err := os.Symlink(outsideDir, filepath.Join(tmpDir, "outside-link")); err != nil {
			t.Fatalf("Symlink setup failed: %v", err)
		}

		if err := fs.Delete("outside-link/outside.md"); !errors.Is(err, ErrInvalidPath) {
			t.Fatalf("Expected vault containment rejection, got %v", err)
		}
		if _, err := os.Stat(outsidePath); err != nil {
			t.Fatalf("Outside file was affected: %v", err)
		}
	})
}
