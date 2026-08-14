//go:build cli

package main

import "testing"

func TestRootCommandVersion(t *testing.T) {
	if version != "1.0.1" {
		t.Fatalf("version = %q, want 1.0.1", version)
	}
	if rootCmd.Version != "1.0.1" {
		t.Fatalf("rootCmd.Version = %q, want 1.0.1", rootCmd.Version)
	}
}
