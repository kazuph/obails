//go:build !production

package main

import (
	"bytes"
	"image"
	"image/png"
	"testing"
)

func TestDevelopmentApplicationName(t *testing.T) {
	if applicationName != "Obails Dev" {
		t.Fatalf("applicationName = %q, want Obails Dev", applicationName)
	}
}

func TestDevelopmentIconBadgeHasBalancedTextPadding(t *testing.T) {
	icon, err := png.Decode(bytes.NewReader(appIcon))
	if err != nil {
		t.Fatalf("decode development icon: %v", err)
	}

	badge := image.Rectangle{Min: icon.Bounds().Max, Max: icon.Bounds().Min}
	for y := icon.Bounds().Dy() * 3 / 4; y < icon.Bounds().Dy(); y++ {
		for x := icon.Bounds().Dx() / 2; x < icon.Bounds().Dx(); x++ {
			r, g, b, a := icon.At(x, y).RGBA()
			if a > 0xc000 && r > 0xe000 && g > 0x4000 && g < 0xc000 && b < 0x4000 {
				includePoint(&badge, x, y)
			}
		}
	}
	if badge.Empty() {
		t.Fatal("development icon has no orange DEV badge")
	}

	text := image.Rectangle{Min: icon.Bounds().Max, Max: icon.Bounds().Min}
	insetX, insetY := badge.Dx()/10, badge.Dy()/6
	for y := badge.Min.Y + insetY; y < badge.Max.Y-insetY; y++ {
		for x := badge.Min.X + insetX; x < badge.Max.X-insetX; x++ {
			r, g, b, a := icon.At(x, y).RGBA()
			if a > 0xc000 && r > 0xe800 && g > 0xe800 && b > 0xe800 {
				includePoint(&text, x, y)
			}
		}
	}
	if text.Empty() {
		t.Fatal("development icon has no white DEV text inside the badge")
	}

	leftPadding := text.Min.X - badge.Min.X
	rightPadding := badge.Max.X - text.Max.X
	tolerance := badge.Dx() / 20
	if difference(leftPadding, rightPadding) > tolerance {
		t.Fatalf("DEV badge horizontal padding is unbalanced: left=%dpx right=%dpx tolerance=%dpx", leftPadding, rightPadding, tolerance)
	}
	t.Logf("DEV badge horizontal padding: left=%dpx right=%dpx tolerance=%dpx", leftPadding, rightPadding, tolerance)
}

func includePoint(bounds *image.Rectangle, x, y int) {
	if bounds.Empty() {
		*bounds = image.Rect(x, y, x+1, y+1)
		return
	}
	if x < bounds.Min.X {
		bounds.Min.X = x
	}
	if y < bounds.Min.Y {
		bounds.Min.Y = y
	}
	if x >= bounds.Max.X {
		bounds.Max.X = x + 1
	}
	if y >= bounds.Max.Y {
		bounds.Max.Y = y + 1
	}
}

func difference(a, b int) int {
	if a > b {
		return a - b
	}
	return b - a
}
