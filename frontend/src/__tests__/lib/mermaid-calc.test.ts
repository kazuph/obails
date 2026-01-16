import { describe, it, expect } from "vitest";
import {
  clampZoom,
  calculateZoomPan,
  calculateCenteredPosition,
  calculateFitZoom,
  calculateMinimapScale,
} from "../../lib/mermaid-calc";

describe("clampZoom", () => {
  it("should multiply zoom by factor", () => {
    expect(clampZoom(1, 2)).toBe(2);
    expect(clampZoom(2, 0.5)).toBe(1);
  });

  it("should clamp to maximum zoom", () => {
    expect(clampZoom(8, 2)).toBe(10);
    expect(clampZoom(5, 3)).toBe(10);
  });

  it("should clamp to minimum zoom", () => {
    expect(clampZoom(0.2, 0.25)).toBe(0.1);
    expect(clampZoom(0.1, 0.5)).toBe(0.1);
  });

  it("should allow custom min/max bounds", () => {
    expect(clampZoom(5, 2, 0.5, 8)).toBe(8);
    expect(clampZoom(1, 0.1, 0.5, 8)).toBe(0.5);
  });
});

describe("calculateZoomPan", () => {
  it("should maintain position when zoom ratio is 1", () => {
    const result = calculateZoomPan(100, 100, 50, 50, 1);
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
  });

  it("should calculate new pan position for zoom in", () => {
    // Zooming in by 2x at point (100, 100) with current pan at (0, 0)
    const result = calculateZoomPan(100, 100, 0, 0, 2);
    expect(result.x).toBe(-100);
    expect(result.y).toBe(-100);
  });

  it("should calculate new pan position for zoom out", () => {
    // Zooming out by 0.5x at point (100, 100) with current pan at (0, 0)
    const result = calculateZoomPan(100, 100, 0, 0, 0.5);
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
  });

  it("should keep mouse point fixed during zoom", () => {
    // If we zoom at the exact pan position, it should stay the same
    const result = calculateZoomPan(50, 50, 50, 50, 2);
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
  });
});

describe("calculateCenteredPosition", () => {
  it("should center SVG in viewport", () => {
    const result = calculateCenteredPosition(100, 100, 500, 500, 1, 0, 0);
    expect(result.x).toBe(200);
    expect(result.y).toBe(200);
  });

  it("should account for zoom when centering", () => {
    const result = calculateCenteredPosition(100, 100, 500, 500, 2, 0, 0);
    // scaledWidth = 200, scaledHeight = 200
    // x = (500 - 200) / 2 = 150
    expect(result.x).toBe(150);
    expect(result.y).toBe(150);
  });

  it("should apply offsets", () => {
    const result = calculateCenteredPosition(100, 100, 500, 500, 1, 20, 60);
    expect(result.x).toBe(220);
    expect(result.y).toBe(260);
  });
});

describe("calculateFitZoom", () => {
  it("should fit horizontally constrained SVG", () => {
    // Wide SVG: 1000x500 in 500x500 viewport
    const result = calculateFitZoom(1000, 500, 500, 500);
    expect(result).toBe(0.5);
  });

  it("should fit vertically constrained SVG", () => {
    // Tall SVG: 500x1000 in 500x500 viewport
    const result = calculateFitZoom(500, 1000, 500, 500);
    expect(result).toBe(0.5);
  });

  it("should return 1 when SVG fits exactly", () => {
    const result = calculateFitZoom(500, 500, 500, 500);
    expect(result).toBe(1);
  });

  it("should scale up small SVGs", () => {
    // Small SVG: 100x100 in 500x500 viewport
    const result = calculateFitZoom(100, 100, 500, 500);
    expect(result).toBe(5);
  });
});

describe("calculateMinimapScale", () => {
  it("should scale to fit minimap width", () => {
    // Wide SVG
    const result = calculateMinimapScale(368, 100, 184, 134);
    expect(result).toBe(0.5);
  });

  it("should scale to fit minimap height", () => {
    // Tall SVG
    const result = calculateMinimapScale(100, 268, 184, 134);
    expect(result).toBe(0.5);
  });

  it("should use default minimap dimensions", () => {
    const result = calculateMinimapScale(184, 134);
    expect(result).toBe(1);
  });
});
