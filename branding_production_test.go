//go:build production

package main

import "testing"

func TestProductionApplicationName(t *testing.T) {
	if applicationName != "Obails" {
		t.Fatalf("applicationName = %q, want Obails", applicationName)
	}
}
