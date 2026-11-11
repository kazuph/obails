//go:build cli

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The commands below start with initServices(), which does not build the link index.
// file=<name> must still find a note by name in any folder.

const nestedNoteName = "2026-11-11 Fable 5.2 の tips"
const nestedNotePath = "30_知識/手順/" + nestedNoteName + ".md"

func newFileResolutionVault(t *testing.T) string {
	t.Helper()
	preserveFlags(t, rootCmd)

	tmpDir := t.TempDir()
	vaultDir := filepath.Join(tmpDir, "vault")
	if err := os.MkdirAll(filepath.Join(vaultDir, filepath.Dir(nestedNotePath)), 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	configPath := filepath.Join(tmpDir, "config.toml")
	if err := os.WriteFile(configPath, []byte("[vault]\npath = \""+vaultDir+"\"\n"), 0644); err != nil {
		t.Fatalf("WriteFile config failed: %v", err)
	}
	t.Setenv("OBAILS_CONFIG_FILE", configPath)

	if err := os.WriteFile(filepath.Join(vaultDir, nestedNotePath), []byte("# tips\n\n- [ ] Nested task\n"), 0644); err != nil {
		t.Fatalf("WriteFile note failed: %v", err)
	}

	setFlag(t, rootCmd, "format", "json")
	setFlag(t, rootCmd, "vault", "")
	return vaultDir
}

func TestResolveFilePath_ResolvesNoteNameWithoutPrebuiltIndex(t *testing.T) {
	newFileResolutionVault(t)
	if err := initServices(); err != nil {
		t.Fatalf("initServices failed: %v", err)
	}

	got, err := resolveFilePath(nestedNoteName, "")
	if err != nil {
		t.Fatalf("resolveFilePath by name failed: %v", err)
	}
	if got != nestedNotePath {
		t.Fatalf("got %q, want %q", got, nestedNotePath)
	}

	if _, err := resolveFilePath("no such note", ""); err == nil || !strings.Contains(err.Error(), "note not found") {
		t.Fatalf("missing note: got error %v, want note not found", err)
	}
}

func TestResolveTaskFilePath_ResolvesNoteNameWithoutPrebuiltIndex(t *testing.T) {
	newFileResolutionVault(t)
	preserveFlags(t, tasksCmd)
	if err := initServices(); err != nil {
		t.Fatalf("initServices failed: %v", err)
	}

	setFlag(t, tasksCmd, "path", "")
	setFlag(t, tasksCmd, "file", nestedNoteName)
	got, err := resolveTaskFilePath(tasksCmd)
	if err != nil {
		t.Fatalf("resolveTaskFilePath by name failed: %v", err)
	}
	if got != nestedNotePath {
		t.Fatalf("got %q, want %q", got, nestedNotePath)
	}
}

func TestRunUpsert_AppendsToExistingNoteInSubfolder(t *testing.T) {
	vaultDir := newFileResolutionVault(t)
	preserveFlags(t, upsertCmd)

	setFlag(t, upsertCmd, "file", nestedNoteName)
	setFlag(t, upsertCmd, "content", "upserted line")
	setFlag(t, upsertCmd, "content-file", "")
	setFlag(t, upsertCmd, "template", "")
	setFlag(t, upsertCmd, "section", "")
	setFlag(t, upsertCmd, "silent", "true")
	if _, err := captureCommandOutput(t, func() error { return runUpsert(upsertCmd, nil) }); err != nil {
		t.Fatalf("runUpsert failed: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(vaultDir, nestedNotePath))
	if err != nil {
		t.Fatalf("ReadFile note failed: %v", err)
	}
	if !strings.Contains(string(content), "upserted line") {
		t.Fatalf("existing note was not appended: %q", string(content))
	}
	if _, err := os.Stat(filepath.Join(vaultDir, nestedNoteName+".md")); !os.IsNotExist(err) {
		t.Fatalf("upsert created a duplicate note at the vault root (stat error: %v)", err)
	}
}
