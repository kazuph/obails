//go:build cli

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kazuph/obails/services"
)

func TestOpenFileResolutionAndState(t *testing.T) {
	vault := t.TempDir()
	config := services.NewConfigService()
	config.OverrideVaultPath(vault)
	oldFile, oldState := fileService, stateService
	t.Cleanup(func() { fileService, stateService = oldFile, oldState })
	fileService, stateService = services.NewFileService(config), services.NewStateService(config)
	for _, tc := range []struct{ input, name, kind string }{
		{"note", "note.md", "markdown"}, {"page.html", "page.html", "html"},
		{"document.pdf", "document.pdf", "pdf"}, {"image.png", "image.png", "image"},
		{"page.HTM", "page.HTM", "html"}, {"sound.wav", "sound.wav", "audio"},
		{"archive.bin", "archive.bin", "other"},
	} {
		t.Run(tc.input, func(t *testing.T) {
			if err := os.WriteFile(filepath.Join(vault, tc.name), []byte("x"), 0600); err != nil {
				t.Fatal(err)
			}
			got, err := resolveOpenFilePath("", tc.input)
			if err != nil || got != tc.name {
				t.Fatalf("resolve = %q, %v; want %q", got, err, tc.name)
			}
			updateLastOpenedFile(got)
			state := stateService.GetLastOpenedFile()
			if state == nil || state.Path != tc.name || state.FileType != tc.kind {
				t.Fatalf("state = %#v", state)
			}
		})
	}
	for _, name := range []string{"missing.html", "../outside.html"} {
		if got, err := resolveOpenFilePath("", name); err == nil {
			t.Errorf("resolved invalid path %q to %q", name, got)
		}
	}
}

func TestDottedPathNoteCommandsKeepMarkdownTarget(t *testing.T) {
	preserveFlags(t, rootCmd)
	preserveFlags(t, appendCmd)
	preserveFlags(t, deleteCmd)
	vault := t.TempDir()
	config := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(config, []byte("[vault]\npath = \""+vault+"\"\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OBAILS_CONFIG_FILE", config)
	for _, name := range []string{"report.v1", "report.v1.md"} {
		if err := os.WriteFile(filepath.Join(vault, name), []byte("original"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	setFlag(t, rootCmd, "vault", "")
	setFlag(t, appendCmd, "path", "report.v1")
	setFlag(t, appendCmd, "content", "added")
	if _, err := captureCommandOutput(t, func() error { return runAppend(appendCmd, nil) }); err != nil {
		t.Fatal(err)
	}
	markdown, err := os.ReadFile(filepath.Join(vault, "report.v1.md"))
	if err != nil || !strings.Contains(string(markdown), "added") {
		t.Fatalf("markdown = %q, %v", markdown, err)
	}
	plain, err := os.ReadFile(filepath.Join(vault, "report.v1"))
	if err != nil || string(plain) != "original" {
		t.Fatalf("plain = %q, %v", plain, err)
	}
	setFlag(t, deleteCmd, "path", "report.v1")
	setFlag(t, deleteCmd, "force", "true")
	if _, err := captureCommandOutput(t, func() error { return runDelete(deleteCmd, nil) }); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(vault, "report.v1.md")); !os.IsNotExist(err) {
		t.Fatalf("markdown remains: %v", err)
	}
	if _, err := os.Stat(filepath.Join(vault, "report.v1")); err != nil {
		t.Fatalf("plain removed: %v", err)
	}
}
