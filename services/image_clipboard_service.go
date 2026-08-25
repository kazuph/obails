package services

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const setPNGClipboardScript = `on run argv
set imageFile to POSIX file (item 1 of argv)
set imageData to read imageFile as «class PNGf»
set the clipboard to imageData
end run`

var codeCardGradient = [4]color.RGBA{
	{R: 0x2d, G: 0x1b, B: 0x69, A: 0xff},
	{R: 0x0b, G: 0x3b, B: 0x5a, A: 0xff},
	{R: 0x4f, G: 0x20, B: 0x59, A: 0xff},
	{R: 0x0c, G: 0x2d, B: 0x45, A: 0xff},
}

// ImageClipboardService renders code cards and writes PNG images to the native macOS pasteboard.
type ImageClipboardService struct {
	freezePath string
}

func NewImageClipboardService() *ImageClipboardService {
	return &ImageClipboardService{}
}

func newImageClipboardService(freezePath string) *ImageClipboardService {
	return &ImageClipboardService{freezePath: freezePath}
}

func (s *ImageClipboardService) SetPNG(base64PNG string) error {
	data, err := base64.StdEncoding.DecodeString(base64PNG)
	if err != nil {
		return fmt.Errorf("decode PNG clipboard data: %w", err)
	}
	return setPNGClipboard(data)
}

// SetCodePNG renders source code with Freeze's full code-card template and copies it as PNG.
func (s *ImageClipboardService) SetCodePNG(code, language string) error {
	data, err := s.renderCodePNG(code, language)
	if err != nil {
		return err
	}
	return setPNGClipboard(data)
}

func (s *ImageClipboardService) renderCodePNG(code, language string) ([]byte, error) {
	if strings.TrimSpace(code) == "" {
		return nil, fmt.Errorf("render code card: code is empty")
	}

	helper, err := s.freezeHelperPath()
	if err != nil {
		return nil, err
	}
	tempDir, err := os.MkdirTemp("", "obails-code-card-*")
	if err != nil {
		return nil, fmt.Errorf("create code card directory: %w", err)
	}
	defer os.RemoveAll(tempDir)

	outputPath := filepath.Join(tempDir, "code-card.png")
	args := []string{"-c", "full", "--theme", "dracula", "--output", outputPath}
	if language = strings.TrimSpace(language); language != "" {
		args = append(args, "--language", language)
	}
	args = append(args, "-")
	cmd := exec.Command(helper, args...)
	cmd.Stdin = strings.NewReader(code)
	if output, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("render code card: %w: %s", err, bytes.TrimSpace(output))
	}

	data, err := os.ReadFile(outputPath)
	if err != nil {
		return nil, fmt.Errorf("read code card PNG: %w", err)
	}
	return composeCodeCardBackground(data)
}

func (s *ImageClipboardService) freezeHelperPath() (string, error) {
	if isExecutableFile(s.freezePath) {
		return s.freezePath, nil
	}
	if executable, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(executable), "obails-freeze")
		if isExecutableFile(candidate) {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("obails-freeze helper not found; rebuild Obails")
}

func composeCodeCardBackground(data []byte) ([]byte, error) {
	source, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode code card PNG: %w", err)
	}
	canvas := image.NewRGBA(source.Bounds())
	drawCodeCardGradient(canvas)
	draw.Draw(canvas, canvas.Bounds(), source, source.Bounds().Min, draw.Over)

	var encoded bytes.Buffer
	if err := png.Encode(&encoded, canvas); err != nil {
		return nil, fmt.Errorf("encode code card PNG: %w", err)
	}
	return encoded.Bytes(), nil
}

func drawCodeCardGradient(canvas *image.RGBA) {
	bounds := canvas.Bounds()
	maxX := bounds.Dx() - 1
	maxY := bounds.Dy() - 1
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		left := blendRGBA(codeCardGradient[0], codeCardGradient[2], y-bounds.Min.Y, maxY)
		right := blendRGBA(codeCardGradient[1], codeCardGradient[3], y-bounds.Min.Y, maxY)
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			canvas.SetRGBA(x, y, blendRGBA(left, right, x-bounds.Min.X, maxX))
		}
	}
}

func blendRGBA(start, end color.RGBA, position, maximum int) color.RGBA {
	if maximum <= 0 {
		return start
	}
	blend := func(a, b uint8) uint8 {
		return uint8((int(a)*(maximum-position) + int(b)*position) / maximum)
	}
	return color.RGBA{
		R: blend(start.R, end.R),
		G: blend(start.G, end.G),
		B: blend(start.B, end.B),
		A: blend(start.A, end.A),
	}
}

func setPNGClipboard(data []byte) error {
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
