package services

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image/png"
	"os"
	"os/exec"
)

const setPNGClipboardScript = `on run argv
set imageFile to POSIX file (item 1 of argv)
set imageData to read imageFile as «class PNGf»
set the clipboard to imageData
end run`

// ImageClipboardService writes PNG images to the native macOS pasteboard.
type ImageClipboardService struct{}

func NewImageClipboardService() *ImageClipboardService {
	return &ImageClipboardService{}
}

func (s *ImageClipboardService) SetPNG(base64PNG string) error {
	data, err := base64.StdEncoding.DecodeString(base64PNG)
	if err != nil {
		return fmt.Errorf("decode PNG clipboard data: %w", err)
	}
	if _, err := png.DecodeConfig(bytes.NewReader(data)); err != nil {
		return fmt.Errorf("validate PNG clipboard data: %w", err)
	}

	file, err := os.CreateTemp("", "obails-clipboard-*.png")
	if err != nil {
		return fmt.Errorf("create PNG clipboard file: %w", err)
	}
	path := file.Name()
	defer os.Remove(path)

	if err := file.Chmod(0o600); err != nil {
		file.Close()
		return fmt.Errorf("protect PNG clipboard file: %w", err)
	}
	if _, err := file.Write(data); err != nil {
		file.Close()
		return fmt.Errorf("write PNG clipboard file: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close PNG clipboard file: %w", err)
	}

	if output, err := exec.Command("osascript", "-e", setPNGClipboardScript, path).CombinedOutput(); err != nil {
		return fmt.Errorf("write native image clipboard: %w: %s", err, bytes.TrimSpace(output))
	}
	return nil
}
