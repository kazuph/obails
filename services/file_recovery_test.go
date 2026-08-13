package services

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kazuph/obails/models"
)

func newRecoveryTestFileService(t *testing.T) (*FileService, *ConfigService, string, string) {
	t.Helper()
	root, err := os.MkdirTemp("", "obails-recovery-test-*")
	if err != nil {
		t.Fatalf("MkdirTemp: %v", err)
	}
	vaultPath := filepath.Join(root, "vault")
	configDir := filepath.Join(root, "obails-config")
	if err := os.MkdirAll(vaultPath, 0755); err != nil {
		os.RemoveAll(root)
		t.Fatalf("create vault: %v", err)
	}
	cs := &ConfigService{
		configPath: filepath.Join(configDir, "config.toml"),
		configDir:  configDir,
		config: &models.Config{
			Vault: models.VaultConfig{
				Path:       vaultPath,
				DeleteMode: models.DeleteModePermanent,
			},
			Recovery: models.FileRecoveryConfig{
				SnapshotIntervalMinutes: models.DefaultRecoverySnapshotIntervalMinutes,
				RetentionDays:           models.DefaultRecoveryRetentionDays,
			},
		},
	}
	return NewFileService(cs), cs, vaultPath, root
}

func TestFileService_RecoverySnapshots(t *testing.T) {
	fs, _, vaultPath, root := newRecoveryTestFileService(t)
	defer os.RemoveAll(root)

	if err := fs.CreateFile("notes/draft.md", "first revision"); err != nil {
		t.Fatalf("CreateFile: %v", err)
	}
	if err := fs.CreateDirectory("empty"); err != nil {
		t.Fatalf("CreateDirectory: %v", err)
	}

	first, err := fs.SaveRecoverySnapshot()
	if err != nil || !first.Created {
		t.Fatalf("first snapshot = %#v, %v", first, err)
	}
	if first.Snapshot.FileCount != 1 {
		t.Fatalf("snapshot file count = %d, want 1", first.Snapshot.FileCount)
	}
	dataDir, err := fs.configService.GetRecoveryDataDir()
	if err != nil {
		t.Fatalf("GetRecoveryDataDir: %v", err)
	}
	if isWithinVault(vaultPath, dataDir) {
		t.Fatalf("recovery data %q must be outside vault %q", dataDir, vaultPath)
	}

	if err := fs.WriteFile("notes/draft.md", "second revision"); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	tooSoon, err := fs.SaveRecoverySnapshot()
	if err != nil || tooSoon.Created || tooSoon.Snapshot.ID != first.Snapshot.ID {
		t.Fatalf("interval gate = %#v, %v", tooSoon, err)
	}

	storage, err := fs.recoveryStorage()
	if err != nil {
		t.Fatalf("recoveryStorage: %v", err)
	}
	firstMetadata, err := readRecoverySnapshot(filepath.Join(storage.snapshots, first.Snapshot.ID))
	if err != nil {
		t.Fatalf("read first snapshot metadata: %v", err)
	}
	firstMetadata.CreatedAt = time.Now().UTC().Add(-fs.configService.GetRecoverySnapshotInterval())
	if err := writeRecoveryJSON(filepath.Join(storage.snapshots, first.Snapshot.ID, recoveryMetadataFile), firstMetadata); err != nil {
		t.Fatalf("age first snapshot metadata: %v", err)
	}
	second, err := fs.SaveRecoverySnapshot()
	if err != nil || !second.Created {
		t.Fatalf("second snapshot = %#v, %v", second, err)
	}
	if got, err := fs.ReadRecoverySnapshotFile(first.Snapshot.ID, "notes/draft.md"); err != nil || got != "first revision" {
		t.Fatalf("first snapshot content = %q, %v", got, err)
	}
	if got, err := fs.ReadRecoverySnapshotFile(second.Snapshot.ID, "notes/draft.md"); err != nil || got != "second revision" {
		t.Fatalf("second snapshot content = %q, %v", got, err)
	}

	if err := fs.CreateFile("created-after-snapshot.md", "new"); err != nil {
		t.Fatalf("CreateFile: %v", err)
	}
	if err := os.Remove(filepath.Join(vaultPath, "notes", "draft.md")); err != nil {
		t.Fatalf("delete current file before snapshot restore: %v", err)
	}
	if err := fs.RestoreRecoverySnapshotFile(first.Snapshot.ID, "notes/draft.md"); err != nil {
		t.Fatalf("RestoreRecoverySnapshotFile: %v", err)
	}
	if got, err := fs.ReadFile("notes/draft.md"); err != nil || got != "first revision" {
		t.Fatalf("restored content = %q, %v", got, err)
	}
	if _, err := os.Stat(filepath.Join(storage.snapshots, first.Snapshot.ID, "contents", "empty")); err != nil {
		t.Fatalf("empty directory missing from complete snapshot: %v", err)
	}
	if !fs.FileExists("created-after-snapshot.md") {
		t.Fatal("file-level restore removed a file absent from the snapshot")
	}
	if err := os.Remove(filepath.Join(vaultPath, "notes", "draft.md")); err != nil {
		t.Fatalf("remove restored file before symlink test: %v", err)
	}
	if err := os.Symlink("../created-after-snapshot.md", filepath.Join(vaultPath, "notes", "draft.md")); err != nil {
		t.Fatalf("create in-vault target symlink: %v", err)
	}
	if err := fs.RestoreRecoverySnapshotFile(first.Snapshot.ID, "notes/draft.md"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("restore through target symlink = %v, want ErrInvalidPath", err)
	}
	if got, err := fs.ReadFile("created-after-snapshot.md"); err != nil || got != "new" {
		t.Fatalf("target symlink was overwritten: %q, %v", got, err)
	}

	for _, snapshot := range []models.RecoverySnapshot{firstMetadata, second.Snapshot} {
		metadata, err := readRecoverySnapshot(filepath.Join(storage.snapshots, snapshot.ID))
		if err != nil {
			t.Fatalf("read snapshot metadata: %v", err)
		}
		metadata.CreatedAt = time.Now().UTC().Add(-fs.configService.GetRecoveryRetention() - time.Second)
		if err := writeRecoveryJSON(filepath.Join(storage.snapshots, snapshot.ID, recoveryMetadataFile), metadata); err != nil {
			t.Fatalf("expire snapshot metadata: %v", err)
		}
	}
	snapshots, err := fs.ListRecoverySnapshots()
	if err != nil {
		t.Fatalf("ListRecoverySnapshots: %v", err)
	}
	if len(snapshots) != 0 {
		t.Fatalf("expired snapshots retained: %#v", snapshots)
	}
}

func TestFileService_DeleteCreatesRestorableRecentlyDeletedRecord(t *testing.T) {
	fs, cs, vaultPath, root := newRecoveryTestFileService(t)
	defer os.RemoveAll(root)

	if err := fs.CreateFile("notes/delete-me.md", "recoverable"); err != nil {
		t.Fatalf("CreateFile: %v", err)
	}
	if err := fs.Delete("notes/delete-me.md"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	items, err := fs.ListRecentlyDeleted()
	if err != nil || len(items) != 1 {
		t.Fatalf("ListRecentlyDeleted = %#v, %v", items, err)
	}
	item := items[0]
	if item.Path != "notes/delete-me.md" || item.DeleteMode != models.DeleteModePermanent {
		t.Fatalf("unexpected deleted item: %#v", item)
	}
	if fs.FileExists(item.Path) {
		t.Fatal("deleted source remains in vault")
	}
	if err := fs.RestoreRecentlyDeleted(item.ID); err != nil {
		t.Fatalf("RestoreRecentlyDeleted: %v", err)
	}
	if got, err := fs.ReadFile(item.Path); err != nil || got != "recoverable" {
		t.Fatalf("restored file = %q, %v", got, err)
	}
	items, err = fs.ListRecentlyDeleted()
	if err != nil || len(items) != 0 {
		t.Fatalf("restored item remains listed: %#v, %v", items, err)
	}

	if err := fs.Delete(item.Path); err != nil {
		t.Fatalf("second Delete: %v", err)
	}
	items, err = fs.ListRecentlyDeleted()
	if err != nil || len(items) != 1 {
		t.Fatalf("record after second delete = %#v, %v", items, err)
	}
	if err := fs.CreateFile(item.Path, "newer file"); err != nil {
		t.Fatalf("replacement CreateFile: %v", err)
	}
	if err := fs.RestoreRecentlyDeleted(items[0].ID); !errors.Is(err, os.ErrExist) {
		t.Fatalf("collision restore error = %v, want os.ErrExist", err)
	}
	if got, err := fs.ReadFile(item.Path); err != nil || got != "newer file" {
		t.Fatalf("collision overwrote current file: %q, %v", got, err)
	}
	if remaining, err := fs.ListRecentlyDeleted(); err != nil || len(remaining) != 1 {
		t.Fatalf("collision removed recovery record: %#v, %v", remaining, err)
	}

	cs.config.Vault.DeleteMode = models.DeleteModeVaultTrash
	if err := fs.CreateFile("vault-trash.md", "vault trash recovery"); err != nil {
		t.Fatalf("CreateFile: %v", err)
	}
	if err := fs.Delete("vault-trash.md"); err != nil {
		t.Fatalf("vault trash Delete: %v", err)
	}
	items, err = fs.ListRecentlyDeleted()
	if err != nil {
		t.Fatalf("ListRecentlyDeleted after vault trash delete: %v", err)
	}
	var vaultTrashItem models.RecentlyDeletedItem
	for _, candidate := range items {
		if candidate.Path == "vault-trash.md" {
			vaultTrashItem = candidate
			break
		}
	}
	if vaultTrashItem.ID == "" {
		t.Fatalf("missing vault trash recovery record: %#v", items)
	}
	if err := fs.RestoreRecentlyDeleted(vaultTrashItem.ID); err != nil {
		t.Fatalf("RestoreRecentlyDeleted vault trash item: %v", err)
	}
	if got, err := fs.ReadFile("vault-trash.md"); err != nil || got != "vault trash recovery" {
		t.Fatalf("restored vault trash file = %q, %v", got, err)
	}
	if _, err := os.Lstat(filepath.Join(vaultPath, ".trash", "vault-trash.md")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("vault trash residue = %v, want not exist", err)
	}
	if err := fs.Delete("vault-trash.md"); err != nil {
		t.Fatalf("second vault trash Delete: %v", err)
	}

	if err := fs.CreateFile("vault-trash-replaced.md", "original vault trash content"); err != nil {
		t.Fatalf("CreateFile: %v", err)
	}
	if err := fs.Delete("vault-trash-replaced.md"); err != nil {
		t.Fatalf("vault trash Delete: %v", err)
	}
	items, err = fs.ListRecentlyDeleted()
	if err != nil {
		t.Fatalf("ListRecentlyDeleted after replacement delete: %v", err)
	}
	var replacedTrashItem models.RecentlyDeletedItem
	for _, candidate := range items {
		if candidate.Path == "vault-trash-replaced.md" {
			replacedTrashItem = candidate
			break
		}
	}
	if replacedTrashItem.ID == "" {
		t.Fatalf("missing replacement recovery record: %#v", items)
	}
	replacedTrashPath := filepath.Join(vaultPath, ".trash", "vault-trash-replaced.md")
	if err := os.Remove(replacedTrashPath); err != nil {
		t.Fatalf("remove original vault trash residue: %v", err)
	}
	if err := os.WriteFile(replacedTrashPath, []byte("external vault trash content"), 0644); err != nil {
		t.Fatalf("write external vault trash replacement: %v", err)
	}
	if err := fs.RestoreRecentlyDeleted(replacedTrashItem.ID); err == nil {
		t.Fatal("RestoreRecentlyDeleted accepted an externally replaced vault trash residue")
	}
	if fs.FileExists("vault-trash-replaced.md") {
		t.Fatal("failed restore created the target path")
	}
	if content, err := os.ReadFile(replacedTrashPath); err != nil || string(content) != "external vault trash content" {
		t.Fatalf("external vault trash replacement = %q, %v", content, err)
	}
	items, err = fs.ListRecentlyDeleted()
	if err != nil {
		t.Fatalf("ListRecentlyDeleted after rejected restore: %v", err)
	}
	recordRetained := false
	for _, candidate := range items {
		if candidate.ID == replacedTrashItem.ID {
			recordRetained = true
			break
		}
	}
	if !recordRetained {
		t.Fatalf("rejected restore removed its recovery record: %#v", items)
	}

	cs.config.Vault.DeleteMode = models.DeleteModeSystemTrash
	t.Setenv("PATH", "")
	if err := fs.CreateFile("must-not-publish.md", "keep"); err != nil {
		t.Fatalf("CreateFile: %v", err)
	}
	if err := fs.Delete("must-not-publish.md"); err == nil {
		t.Fatal("system trash deletion without trash command unexpectedly succeeded")
	}
	items, err = fs.ListRecentlyDeleted()
	if err != nil {
		t.Fatalf("ListRecentlyDeleted after failed delete: %v", err)
	}
	for _, item := range items {
		if item.Path == "must-not-publish.md" {
			t.Fatalf("failed deletion published a recovery record: %#v", items)
		}
	}
	if !fs.FileExists("must-not-publish.md") {
		t.Fatal("failed system trash deletion removed the source")
	}
}

func TestConfigService_FileRecoveryConfig(t *testing.T) {
	cs, root := newTestConfigService(t)
	defer os.RemoveAll(root)

	cs.config.Recovery = models.FileRecoveryConfig{}
	if got := cs.GetRecoverySnapshotInterval(); got != models.DefaultRecoverySnapshotIntervalMinutes*time.Minute {
		t.Fatalf("default snapshot interval = %v", got)
	}
	if got := cs.GetRecoveryRetention(); got != models.DefaultRecoveryRetentionDays*24*time.Hour {
		t.Fatalf("default retention = %v", got)
	}
	cs.config.Recovery = models.FileRecoveryConfig{SnapshotIntervalMinutes: -1, RetentionDays: -1}
	if got := cs.GetRecoverySnapshotInterval(); got != models.DefaultRecoverySnapshotIntervalMinutes*time.Minute {
		t.Fatalf("invalid snapshot interval = %v", got)
	}
	if got := cs.GetRecoveryRetention(); got != models.DefaultRecoveryRetentionDays*24*time.Hour {
		t.Fatalf("invalid retention = %v", got)
	}
	config := models.FileRecoveryConfig{SnapshotIntervalMinutes: 10, RetentionDays: 14}
	if err := cs.SetFileRecoveryConfig(config); err != nil {
		t.Fatalf("SetFileRecoveryConfig: %v", err)
	}
	if err := cs.ReloadConfig(); err != nil {
		t.Fatalf("ReloadConfig: %v", err)
	}
	if got := cs.GetConfig().Recovery; got != config {
		t.Fatalf("persisted recovery config = %#v, want %#v", got, config)
	}
	if err := cs.SetFileRecoveryConfig(models.FileRecoveryConfig{SnapshotIntervalMinutes: 1, RetentionDays: 1}); err == nil {
		t.Fatal("too-short snapshot interval was accepted")
	}
}

func assertRecentlyDeletedPath(t *testing.T, fs *FileService, path string) {
	t.Helper()
	items, err := fs.ListRecentlyDeleted()
	if err != nil {
		t.Fatalf("ListRecentlyDeleted: %v", err)
	}
	for _, item := range items {
		if item.Path == path {
			return
		}
	}
	t.Fatalf("recently deleted list lacks %q: %#v", path, items)
}

func TestFileService_RecoveryFailsClosedForExternalSymlinks(t *testing.T) {
	fs, _, vaultPath, root := newRecoveryTestFileService(t)
	defer os.RemoveAll(root)

	outside, err := os.MkdirTemp("", "obails-recovery-outside-*")
	if err != nil {
		t.Fatalf("MkdirTemp: %v", err)
	}
	defer os.RemoveAll(outside)
	outsideFile := filepath.Join(outside, "outside.md")
	if err := os.WriteFile(outsideFile, []byte("outside"), 0644); err != nil {
		t.Fatalf("outside setup: %v", err)
	}
	if err := os.Symlink(outsideFile, filepath.Join(vaultPath, "outside.md")); err != nil {
		t.Fatalf("symlink setup: %v", err)
	}

	if _, err := fs.SaveRecoverySnapshot(); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("snapshot symlink error = %v, want ErrInvalidPath", err)
	}
	if snapshots, err := fs.ListRecoverySnapshots(); err != nil || len(snapshots) != 0 {
		t.Fatalf("failed snapshot was published: %#v, %v", snapshots, err)
	}
	if err := fs.Delete("outside.md"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("delete symlink error = %v, want ErrInvalidPath", err)
	}
	if got, err := os.ReadFile(outsideFile); err != nil || string(got) != "outside" {
		t.Fatalf("outside target changed: %q, %v", got, err)
	}
	if items, err := fs.ListRecentlyDeleted(); err != nil || len(items) != 0 {
		t.Fatalf("rejected symlink published recently-deleted record: %#v, %v", items, err)
	}
}

func TestFileService_RestoreRecentlyDeletedRejectsSymlinkParent(t *testing.T) {
	fs, _, vaultPath, root := newRecoveryTestFileService(t)
	defer os.RemoveAll(root)

	if err := fs.CreateFile("nested/note.md", "recoverable"); err != nil {
		t.Fatalf("CreateFile: %v", err)
	}
	if err := fs.Delete("nested/note.md"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	items, err := fs.ListRecentlyDeleted()
	if err != nil || len(items) != 1 {
		t.Fatalf("ListRecentlyDeleted = %#v, %v", items, err)
	}
	if err := os.Remove(filepath.Join(vaultPath, "nested")); err != nil {
		t.Fatalf("remove empty parent: %v", err)
	}
	outside := filepath.Join(root, "outside")
	if err := os.Mkdir(outside, 0755); err != nil {
		t.Fatalf("create outside directory: %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(vaultPath, "nested")); err != nil {
		t.Fatalf("create parent symlink: %v", err)
	}

	if err := fs.RestoreRecentlyDeleted(items[0].ID); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("restore through parent symlink = %v, want ErrInvalidPath", err)
	}
	if _, err := os.Stat(filepath.Join(outside, "note.md")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("restore wrote outside the vault: %v", err)
	}
}
