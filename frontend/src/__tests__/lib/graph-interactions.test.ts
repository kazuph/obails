import { describe, expect, it } from "vitest";
import {
  classifyGraphGesture,
  classifyGraphWheel,
  getGraphLabelFontSize,
  getGraphLabelText,
  getGraphNativeMagnifyZoomFactor,
  getGraphTouchPinch,
  getGraphWheelPanDelta,
  getGraphWheelZoomFactor,
  shouldShowGraphNodeLabel,
} from "../../lib/graph-interactions";

describe("classifyGraphWheel", () => {
  it("classifyGraphWheel_WithUnmodifiedTwoFingerScroll_ReturnsPan", () => {
    // Arrange
    const wheel = { deltaX: 80, deltaY: 120, ctrlKey: false, metaKey: false };

    // Act
    const action = classifyGraphWheel(wheel);

    // Assert
    expect(action).toBe("pan");
  });

  it("classifyGraphWheel_WithCtrlWheelPinch_ReturnsZoom", () => {
    // Arrange
    const wheel = { deltaX: 0, deltaY: -80, ctrlKey: true, metaKey: false };

    // Act
    const action = classifyGraphWheel(wheel);

    // Assert
    expect(action).toBe("zoom");
  });

  it("classifyGraphWheel_WithMetaWheelPinch_ReturnsZoom", () => {
    // Arrange
    const wheel = { deltaX: 0, deltaY: -80, ctrlKey: false, metaKey: true };

    // Act
    const action = classifyGraphWheel(wheel);

    // Assert
    expect(action).toBe("zoom");
  });

  it("classifyGraphWheel_WithShiftWheelPinch_ReturnsZoom", () => {
    // Arrange
    const wheel = { deltaX: 0, deltaY: -80, ctrlKey: false, metaKey: false, shiftKey: true };

    // Act
    const action = classifyGraphWheel(wheel);

    // Assert
    expect(action).toBe("zoom");
  });
});

describe("getGraphWheelPanDelta", () => {
  it("getGraphWheelPanDelta_WithCurrentZoom_ReturnsGraphSpaceDelta", () => {
    // Arrange
    const wheel = { deltaX: 80, deltaY: 120 };

    // Act
    const delta = getGraphWheelPanDelta(wheel, 2);

    // Assert
    expect(delta).toEqual({ x: 40, y: 60 });
  });
});

describe("getGraphWheelZoomFactor", () => {
  it("getGraphWheelZoomFactor_WithVerticalPinchDelta_ReturnsZoomInFactor", () => {
    // Arrange
    const wheel = { deltaX: 0, deltaY: -80 };

    // Act
    const factor = getGraphWheelZoomFactor(wheel);

    // Assert
    expect(factor).toBeGreaterThan(1);
  });
});

describe("getGraphNativeMagnifyZoomFactor", () => {
  it("getGraphNativeMagnifyZoomFactor_WithPositiveMagnification_ReturnsZoomInFactor", () => {
    // Arrange
    const magnification = 0.2;

    // Act
    const factor = getGraphNativeMagnifyZoomFactor(magnification);

    // Assert
    expect(factor).toBeGreaterThan(1);
  });

  it("getGraphNativeMagnifyZoomFactor_WithNegativeMagnification_ReturnsZoomOutFactor", () => {
    // Arrange
    const magnification = -0.2;

    // Act
    const factor = getGraphNativeMagnifyZoomFactor(magnification);

    // Assert
    expect(factor).toBeGreaterThan(0);
    expect(factor).toBeLessThan(1);
  });

  it("getGraphNativeMagnifyZoomFactor_WithInvalidMagnification_ReturnsNeutralFactor", () => {
    // Act
    const factor = getGraphNativeMagnifyZoomFactor(Number.NaN);

    // Assert
    expect(factor).toBe(1);
  });
});

describe("shouldShowGraphNodeLabel", () => {
  it("shouldShowGraphNodeLabel_WithSmallGraph_ReturnsTrueForEveryNode", () => {
    expect(shouldShowGraphNodeLabel(0, 1, false)).toBe(true);
  });

  it("shouldShowGraphNodeLabel_WithLargeGraphAtMediumZoom_HidesLowDegreeLabels", () => {
    expect(shouldShowGraphNodeLabel(4, 3, true)).toBe(false);
    expect(shouldShowGraphNodeLabel(12, 3, true)).toBe(true);
  });

  it("shouldShowGraphNodeLabel_WithLargeGraphAtHighZoom_DoesNotShowEveryNode", () => {
    expect(shouldShowGraphNodeLabel(2, 8, true)).toBe(false);
    expect(shouldShowGraphNodeLabel(10, 8, true)).toBe(true);
  });
});

describe("getGraphLabelFontSize", () => {
  it("getGraphLabelFontSize_WithLargeGraphZoomedIn_KeepsScreenSizeBounded", () => {
    const graphFontSize = getGraphLabelFontSize(8, true);
    const screenFontSize = graphFontSize * 8;

    expect(screenFontSize).toBeLessThanOrEqual(11);
  });

  it("getGraphLabelFontSize_WithInvalidScale_ReturnsScreenFontSize", () => {
    expect(getGraphLabelFontSize(0, true)).toBe(11);
  });
});

describe("getGraphLabelText", () => {
  it("getGraphLabelText_WithLargeGraph_TruncatesLongLabels", () => {
    const label = "2026-07-08 AI設定最適化（claude-codex スキル・ルール・メモリ整理）文献ノート";

    expect(getGraphLabelText(label, true)).toHaveLength(22);
    expect(getGraphLabelText(label, true)).toMatch(/\.\.\.$/);
  });
});

describe("classifyGraphGesture", () => {
  it("classifyGraphGesture_WithScaleChange_ReturnsZoom", () => {
    // Arrange
    const gesture = { scale: 1.25 };

    // Act
    const action = classifyGraphGesture(gesture);

    // Assert
    expect(action).toBe("zoom");
  });
});

describe("getGraphTouchPinch", () => {
  it("getGraphTouchPinch_WithTwoTouchPoints_ReturnsCenterAndDistance", () => {
    // Arrange
    const touches = [
      { clientX: 100, clientY: 200 },
      { clientX: 140, clientY: 260 },
    ];

    // Act
    const pinch = getGraphTouchPinch(touches);

    // Assert
    expect(pinch).toEqual({
      centerX: 120,
      centerY: 230,
      distance: Math.hypot(40, 60),
    });
  });

  it("getGraphTouchPinch_WithOneTouchPoint_ReturnsNull", () => {
    // Arrange
    const touches = [{ clientX: 100, clientY: 200 }];

    // Act
    const pinch = getGraphTouchPinch(touches);

    // Assert
    expect(pinch).toBeNull();
  });
});
