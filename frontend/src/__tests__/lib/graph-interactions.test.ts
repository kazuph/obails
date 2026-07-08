import { describe, expect, it } from "vitest";
import {
  classifyGraphGesture,
  classifyGraphWheel,
  getGraphTouchPinch,
  getGraphWheelPanDelta,
  getGraphWheelZoomFactor,
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
