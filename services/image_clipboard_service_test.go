package services

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestImageClipboardService_RenderCodePNG(t *testing.T) {
	helper := filepath.Join(t.TempDir(), "obails-freeze")
	build := exec.Command("go", "build", "-o", helper, "github.com/charmbracelet/freeze")
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build real Freeze helper: %v: %s", err, output)
	}

	service := newImageClipboardService(helper)
	code := "package main\n\nimport \"fmt\"\n\nfunc main() { fmt.Println(\"hello\") }\n"
	goPNG, err := service.renderCodePNG(code, "go")
	if err != nil {
		t.Fatalf("render Go code card: %v", err)
	}
	plainPNG, err := service.renderCodePNG(code, "plaintext")
	if err != nil {
		t.Fatalf("render plaintext code card: %v", err)
	}
	if bytes.Equal(goPNG, plainPNG) {
		t.Fatal("language selection did not change the rendered syntax highlighting")
	}

	card, err := png.Decode(bytes.NewReader(goPNG))
	if err != nil {
		t.Fatalf("decode rendered code card: %v", err)
	}
	background := color.RGBA{R: 0x17, G: 0x17, B: 0x17, A: 0xff}
	if got := color.RGBAModel.Convert(card.At(card.Bounds().Min.X, card.Bounds().Min.Y)); got != background {
		t.Fatalf("code card corner = %v, want opaque Freeze full background %v", got, background)
	}

	var hasPanel, hasBorder bool
	for y := card.Bounds().Min.Y; y < card.Bounds().Max.Y && (!hasPanel || !hasBorder); y++ {
		for x := card.Bounds().Min.X; x < card.Bounds().Max.X; x++ {
			pixel := color.RGBAModel.Convert(card.At(x, y)).(color.RGBA)
			hasPanel = hasPanel || pixel == (color.RGBA{R: 0x16, G: 0x16, B: 0x16, A: 0xff})
			hasBorder = hasBorder || pixel == (color.RGBA{R: 0x51, G: 0x51, B: 0x51, A: 0xff})
		}
	}
	if !hasPanel || !hasBorder {
		t.Fatalf("Freeze full card is missing panel or border colors: panel=%v border=%v", hasPanel, hasBorder)
	}

	if runtime.GOOS == "darwin" {
		if err := service.SetCodePNG(code, "go"); err != nil {
			t.Fatalf("copy rendered code card: %v", err)
		}
		assertClipboardContainsPNG(t)
	}
}

func TestImageClipboardService_SetPNG(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("native PNG clipboard integration is macOS-only")
	}

	service := NewImageClipboardService()
	if err := service.SetPNG("not-base64"); err == nil {
		t.Fatal("expected invalid base64 to be rejected")
	}
	if err := service.SetPNG(base64.StdEncoding.EncodeToString([]byte("not a png"))); err == nil {
		t.Fatal("expected non-PNG data to be rejected")
	}

	imageData := image.NewRGBA(image.Rect(0, 0, 2, 1))
	imageData.Set(0, 0, color.RGBA{R: 255, A: 255})
	imageData.Set(1, 0, color.RGBA{B: 255, A: 255})
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, imageData); err != nil {
		t.Fatal(err)
	}
	if err := service.SetPNG(base64.StdEncoding.EncodeToString(encoded.Bytes())); err != nil {
		t.Fatalf("SetPNG returned error: %v", err)
	}

	assertClipboardContainsPNG(t)
}

func assertClipboardContainsPNG(t *testing.T) {
	t.Helper()
	clipboardInfo, err := exec.Command("osascript", "-e", "clipboard info").CombinedOutput()
	if err != nil {
		t.Fatalf("read clipboard info: %v: %s", err, clipboardInfo)
	}
	if !strings.Contains(string(clipboardInfo), "PNGf") {
		t.Fatalf("native clipboard does not contain PNG data: %s", clipboardInfo)
	}
}
