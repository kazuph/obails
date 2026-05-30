package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// TranscribeService transcribes audio files into a sibling Markdown note using
// the Apple Speech CLI helper (obails-transcribe). The generated .md is placed
// next to the audio file so the user can keep editing notes there.
type TranscribeService struct {
	configService *ConfigService
	fileService   *FileService
}

// NewTranscribeService creates a new TranscribeService.
func NewTranscribeService(configService *ConfigService, fileService *FileService) *TranscribeService {
	return &TranscribeService{
		configService: configService,
		fileService:   fileService,
	}
}

// transcribeLocale is the fixed transcription language (Japanese).
const transcribeLocale = "ja-JP"

// transcribeOutput mirrors the JSON emitted by obails-transcribe on stdout.
type transcribeOutput struct {
	Text   string `json:"text"`
	Locale string `json:"locale"`
}

// transcriptPath returns the sibling .md relative path for an audio relative path.
// e.g. "55_Podcast/foo.wav" -> "55_Podcast/foo.md"
func transcriptPath(audioRel string) string {
	ext := filepath.Ext(audioRel)
	return strings.TrimSuffix(audioRel, ext) + ".md"
}

// HasTranscript reports whether a sibling .md already exists for the audio file.
func (s *TranscribeService) HasTranscript(audioRel string) bool {
	mdRel := transcriptPath(audioRel)
	full, err := s.fileService.resolveFullPath(mdRel, false)
	if err != nil {
		return false
	}
	_, err = os.Stat(full)
	return err == nil
}

// Transcribe transcribes the audio file (only if no sibling .md exists yet) and
// returns the relative path of the transcript .md. If a transcript already
// exists, it is returned as-is without re-transcribing (editing is preferred).
func (s *TranscribeService) Transcribe(audioRel string) (string, error) {
	mdRel := transcriptPath(audioRel)

	// Editing-first: never overwrite an existing transcript.
	if s.HasTranscript(audioRel) {
		return mdRel, nil
	}

	audioFull, err := s.fileService.resolveFullPath(audioRel, false)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(audioFull); err != nil {
		return "", fmt.Errorf("audio file not found: %w", err)
	}

	helper, err := transcriberHelperPath()
	if err != nil {
		return "", err
	}

	cmd := exec.Command(helper, audioFull, transcribeLocale)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("transcription failed: %v: %s", err, strings.TrimSpace(stderr.String()))
	}

	var out transcribeOutput
	if err := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &out); err != nil {
		return "", fmt.Errorf("failed to parse transcriber output: %w", err)
	}

	content := buildTranscriptMarkdown(audioRel, out.Text, transcribeLocale, time.Now())
	if err := s.fileService.CreateFile(mdRel, content); err != nil {
		// If it was created concurrently in the meantime, treat as success.
		if errors.Is(err, os.ErrExist) {
			return mdRel, nil
		}
		return "", err
	}
	return mdRel, nil
}

// transcriberHelperPath locates the obails-transcribe binary, preferring the one
// bundled next to the running executable (inside .app/Contents/MacOS), and
// falling back to the repository bin/ directory for dev / `go test`.
func transcriberHelperPath() (string, error) {
	if exe, err := os.Executable(); err == nil {
		cand := filepath.Join(filepath.Dir(exe), "obails-transcribe")
		if isExecutableFile(cand) {
			return cand, nil
		}
	}
	if wd, err := os.Getwd(); err == nil {
		dir := wd
		for i := 0; i < 6; i++ {
			cand := filepath.Join(dir, "bin", "obails-transcribe")
			if isExecutableFile(cand) {
				return cand, nil
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	return "", errors.New("obails-transcribe helper not found (build it with: wails3 task darwin:build:transcriber)")
}

func isExecutableFile(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir() && info.Mode()&0o111 != 0
}

// buildTranscriptMarkdown builds the transcript note content: YAML frontmatter
// (source audio link, timestamp, locale) followed by the transcription body and
// an empty memo section for the user to write notes.
func buildTranscriptMarkdown(audioRel, text, locale string, now time.Time) string {
	audioName := filepath.Base(audioRel)
	title := strings.TrimSuffix(audioName, filepath.Ext(audioName))

	var b strings.Builder
	b.WriteString("---\n")
	b.WriteString(fmt.Sprintf("source: \"[[%s]]\"\n", audioName))
	b.WriteString(fmt.Sprintf("transcribed_at: %s\n", now.Format(time.RFC3339)))
	b.WriteString(fmt.Sprintf("locale: %s\n", locale))
	b.WriteString("---\n\n")
	b.WriteString("# " + title + "\n\n")
	b.WriteString("## 文字起こし\n\n")
	b.WriteString(strings.TrimSpace(text))
	b.WriteString("\n\n## メモ\n\n")
	return b.String()
}
