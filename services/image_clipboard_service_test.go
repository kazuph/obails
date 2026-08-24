package services

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os/exec"
	"runtime"
	"strings"
	"testing"
)

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

	clipboardInfo, err := exec.Command("osascript", "-e", "clipboard info").CombinedOutput()
	if err != nil {
		t.Fatalf("read clipboard info: %v: %s", err, clipboardInfo)
	}
	if !strings.Contains(string(clipboardInfo), "PNGf") {
		t.Fatalf("native clipboard does not contain PNG data: %s", clipboardInfo)
	}
}
