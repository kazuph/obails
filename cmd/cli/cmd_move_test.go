//go:build cli

package main

import "testing"

func TestNormalizeMoveDestination(t *testing.T) {
	tests := []struct {
		name       string
		sourcePath string
		destPath   string
		want       string
		wantErr    bool
	}{
		{
			name:       "adds markdown extension when moving markdown note",
			sourcePath: "Note.md",
			destPath:   "Archive/Note",
			want:       "Archive/Note.md",
		},
		{
			name:       "keeps explicit markdown extension",
			sourcePath: "Note.md",
			destPath:   "Archive/Renamed.md",
			want:       "Archive/Renamed.md",
		},
		{
			name:       "keeps non-markdown destination extension",
			sourcePath: "image.png",
			destPath:   "assets/image.png",
			want:       "assets/image.png",
		},
		{
			name:       "normalizes slash style",
			sourcePath: "Note.md",
			destPath:   "Archive//Nested/Note",
			want:       "Archive/Nested/Note.md",
		},
		{
			name:       "rejects empty destination",
			sourcePath: "Note.md",
			destPath:   " ",
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeMoveDestination(tt.sourcePath, tt.destPath)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("normalizeMoveDestination failed: %v", err)
			}
			if got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}
