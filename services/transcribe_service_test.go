package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestTranscribeService(t *testing.T) (*TranscribeService, string) {
	t.Helper()
	cs, tmpDir := newTestConfigService(t)
	fs := NewFileService(cs)
	ts := NewTranscribeService(cs, fs)
	return ts, tmpDir
}

func TestTranscriptPath(t *testing.T) {
	cases := []struct {
		audio string
		want  string
	}{
		{"foo.wav", "foo.md"},
		{"55_Podcast/foo.mp3", "55_Podcast/foo.md"},
		{"a/b/c.m4a", "a/b/c.md"},
		{"name with spaces.wav", "name with spaces.md"},
		{"小説思考_ユナ版.wav", "小説思考_ユナ版.md"},
	}
	for _, c := range cases {
		if got := transcriptPath(c.audio); got != c.want {
			t.Errorf("transcriptPath(%q) = %q, want %q", c.audio, got, c.want)
		}
	}
}

func TestTranscribeService_HasTranscript(t *testing.T) {
	ts, tmpDir := newTestTranscribeService(t)
	defer os.RemoveAll(tmpDir)

	audioRel := "podcast/episode.wav"

	t.Run("returns false when no transcript exists", func(t *testing.T) {
		if ts.HasTranscript(audioRel) {
			t.Fatal("expected HasTranscript to be false")
		}
	})

	t.Run("returns true after sibling .md is created", func(t *testing.T) {
		mdFull := filepath.Join(tmpDir, "podcast", "episode.md")
		if err := os.MkdirAll(filepath.Dir(mdFull), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(mdFull, []byte("existing"), 0o644); err != nil {
			t.Fatal(err)
		}
		if !ts.HasTranscript(audioRel) {
			t.Fatal("expected HasTranscript to be true")
		}
	})
}

func TestTranscribeService_Transcribe_SkipsExisting(t *testing.T) {
	ts, tmpDir := newTestTranscribeService(t)
	defer os.RemoveAll(tmpDir)

	audioRel := "podcast/episode.wav"
	mdFull := filepath.Join(tmpDir, "podcast", "episode.md")
	if err := os.MkdirAll(filepath.Dir(mdFull), 0o755); err != nil {
		t.Fatal(err)
	}
	original := "# 既存メモ\n\n手で書いた内容"
	if err := os.WriteFile(mdFull, []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}

	// Even without the audio file present, an existing transcript must be
	// returned as-is (no re-transcription, no overwrite).
	mdRel, err := ts.Transcribe(audioRel)
	if err != nil {
		t.Fatalf("Transcribe returned error: %v", err)
	}
	if mdRel != "podcast/episode.md" {
		t.Errorf("Transcribe returned %q, want podcast/episode.md", mdRel)
	}

	got, err := os.ReadFile(mdFull)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != original {
		t.Errorf("existing transcript was modified: got %q", string(got))
	}
}

func TestBuildTranscriptMarkdown(t *testing.T) {
	now := time.Date(2026, 5, 30, 15, 40, 0, 0, time.FixedZone("JST", 9*3600))
	md := buildTranscriptMarkdown("55_Podcast/小説思考_ユナ版.wav", "  これはテスト本文です。  ", "ja-JP", now)

	checks := []string{
		"---\n",
		"source: \"[[小説思考_ユナ版.wav]]\"\n",
		"transcribed_at: 2026-05-30T15:40:00+09:00\n",
		"locale: ja-JP\n",
		"# 小説思考_ユナ版\n",
		"## 文字起こし\n",
		"これはテスト本文です。",
		"## メモ\n",
	}
	for _, want := range checks {
		if !strings.Contains(md, want) {
			t.Errorf("markdown missing %q\n--- full ---\n%s", want, md)
		}
	}

	// Body text must be trimmed.
	if strings.Contains(md, "  これはテスト本文です。  ") {
		t.Error("expected body text to be trimmed of surrounding whitespace")
	}

	// Frontmatter must come first.
	if !strings.HasPrefix(md, "---\n") {
		t.Error("expected frontmatter at the very start")
	}
}
