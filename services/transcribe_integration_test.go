package services

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestTranscribeService_Transcribe_RealPipeline exercises the full backend
// pipeline for real (no mocks): it synthesizes Japanese speech with macOS `say`,
// runs the actual obails-transcribe Swift helper through TranscribeService, and
// verifies a sibling .md note is created containing the transcription.
//
// Skipped automatically when not on macOS, when the helper has not been built,
// or when the Japanese TTS voice (Kyoko) is unavailable.
func TestTranscribeService_Transcribe_RealPipeline(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("requires macOS (Apple Speech)")
	}
	if _, err := transcriberHelperPath(); err != nil {
		t.Skip("obails-transcribe helper not built; run: wails3 task darwin:build:transcriber")
	}
	if !japaneseSayVoiceAvailable() {
		t.Skip("Japanese TTS voice (Kyoko) not available")
	}

	ts, tmpDir := newTestTranscribeService(t)
	defer os.RemoveAll(tmpDir)

	// Synthesize a known Japanese phrase into the vault as an audio file.
	const phrase = "これはテストです。音声認識の確認をしています。"
	audioRel := "podcast/sample.aiff"
	audioFull := filepath.Join(tmpDir, audioRel)
	if err := os.MkdirAll(filepath.Dir(audioFull), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := exec.Command("say", "-v", "Kyoko", "-o", audioFull, phrase).Run(); err != nil {
		t.Skipf("failed to synthesize speech with say: %v", err)
	}

	mdRel, err := ts.Transcribe(audioRel)
	if err != nil {
		t.Fatalf("Transcribe failed: %v", err)
	}
	if mdRel != "podcast/sample.md" {
		t.Errorf("expected md path podcast/sample.md, got %q", mdRel)
	}

	content, err := os.ReadFile(filepath.Join(tmpDir, mdRel))
	if err != nil {
		t.Fatalf("transcript .md not created: %v", err)
	}
	md := string(content)

	// Frontmatter and structure.
	for _, want := range []string{
		"source: \"[[sample.aiff]]\"",
		"locale: ja-JP",
		"## 文字起こし",
		"## メモ",
	} {
		if !strings.Contains(md, want) {
			t.Errorf("transcript missing %q\n--- full ---\n%s", want, md)
		}
	}

	// The transcription body should recover meaningful Japanese content.
	// We assert on a distinctive substring rather than the whole phrase to be
	// resilient to minor recognition differences.
	if !strings.Contains(md, "テスト") || !strings.Contains(md, "音声認識") {
		t.Errorf("transcription body did not recover expected content\n--- full ---\n%s", md)
	}
}

func japaneseSayVoiceAvailable() bool {
	out, err := exec.Command("say", "-v", "?").Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), "Kyoko")
}
