package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestVaultRelativeOpenedFile(t *testing.T) {
	vault := t.TempDir()
	outside := t.TempDir()
	insideFile := filepath.Join(vault, "page.html")
	outsideFile := filepath.Join(outside, "outside.html")
	for _, name := range []string{insideFile, outsideFile} {
		if err := os.WriteFile(name, []byte("x"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	link := filepath.Join(vault, "escape.html")
	if err := os.Symlink(outsideFile, link); err != nil {
		t.Fatal(err)
	}
	if got, err := vaultRelativeOpenedFile(vault, insideFile); err != nil || got != "page.html" {
		t.Fatalf("inside = %q, %v", got, err)
	}
	for _, name := range []string{outsideFile, link, "relative.html", vault, filepath.Join(vault, "missing.html")} {
		if got, err := vaultRelativeOpenedFile(vault, name); err == nil {
			t.Errorf("accepted %q as %q", name, got)
		}
	}
}
