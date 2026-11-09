//go:build cli

package main

import (
	"os"
	"path/filepath"
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
			got, err := resolveFilePath("", tc.input)
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
		if got, err := resolveFilePath("", name); err == nil {
			t.Errorf("resolved invalid path %q to %q", name, got)
		}
	}
}
