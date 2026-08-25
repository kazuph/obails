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
	alloyCode := `module 条文検証

abstract sig 方針 {}
one sig 現行条文, 修正版 extends 方針 {}

fact 現行条文の記載 {
  契約上の義務表.義務内容[現行条文][個人データ]
}

assert 現行条文には矛盾する義務がない {
  no 同じ対象に保持と削除が重なる[現行条文]
}

check 現行条文には矛盾する義務がない for 8
`
	alloyPNG, err := service.renderCodePNG(alloyCode, "alloy")
	if err != nil {
		t.Fatalf("render Alloy code card: %v", err)
	}

	card, err := png.Decode(bytes.NewReader(goPNG))
	if err != nil {
		t.Fatalf("decode rendered code card: %v", err)
	}
	corners := []struct {
		point image.Point
		want  color.RGBA
	}{
		{card.Bounds().Min, codeCardGradient[0]},
		{image.Pt(card.Bounds().Max.X-1, card.Bounds().Min.Y), codeCardGradient[1]},
		{image.Pt(card.Bounds().Min.X, card.Bounds().Max.Y-1), codeCardGradient[2]},
		{image.Pt(card.Bounds().Max.X-1, card.Bounds().Max.Y-1), codeCardGradient[3]},
	}
	for _, corner := range corners {
		if got := color.RGBAModel.Convert(card.At(corner.point.X, corner.point.Y)); got != corner.want {
			t.Fatalf("code card corner %v = %v, want desktop gradient %v", corner.point, got, corner.want)
		}
	}

	var hasPanel, hasBorder bool
	for y := card.Bounds().Min.Y; y < card.Bounds().Max.Y && (!hasPanel || !hasBorder); y++ {
		for x := card.Bounds().Min.X; x < card.Bounds().Max.X; x++ {
			pixel := color.RGBAModel.Convert(card.At(x, y)).(color.RGBA)
			hasPanel = hasPanel || pixel == (color.RGBA{R: 0x26, G: 0x2a, B: 0x35, A: 0xff})
			hasBorder = hasBorder || pixel == (color.RGBA{R: 0x3d, G: 0x3d, B: 0x45, A: 0xff})
		}
	}
	if !hasPanel || !hasBorder {
		t.Fatalf("Freeze full card is missing panel or border colors: panel=%v border=%v", hasPanel, hasBorder)
	}

	alloyCard, err := png.Decode(bytes.NewReader(alloyPNG))
	if err != nil {
		t.Fatalf("decode rendered Alloy card: %v", err)
	}
	errorBackground := color.RGBA{R: 0xf0, G: 0x5b, B: 0x5b, A: 0xff}
	for y := alloyCard.Bounds().Min.Y; y < alloyCard.Bounds().Max.Y; y++ {
		for x := alloyCard.Bounds().Min.X; x < alloyCard.Bounds().Max.X; x++ {
			if pixel := color.RGBAModel.Convert(alloyCard.At(x, y)).(color.RGBA); pixel == errorBackground {
				t.Fatalf("Alloy card contains Freeze error-token background at (%d,%d)", x, y)
			}
		}
	}

	if runtime.GOOS == "darwin" {
		if err := service.SetCodePNG(alloyCode, "alloy"); err != nil {
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
