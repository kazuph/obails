//go:build cli

package main

import "testing"

func TestRootCommandVersion(t *testing.T) {
	if version != "1.1.3" {
		t.Fatalf("version = %q, want 1.1.3", version)
	}
	if rootCmd.Version != "1.1.3" {
		t.Fatalf("rootCmd.Version = %q, want 1.1.3", rootCmd.Version)
	}
}
