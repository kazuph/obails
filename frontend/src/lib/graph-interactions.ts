export type GraphWheelAction = "pan" | "zoom";
export type GraphGestureAction = "zoom";

export interface GraphWheelLike {
  deltaX: number;
  deltaY: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface GraphGestureLike {
  scale: number;
}

export interface GraphTouchPointLike {
  clientX: number;
  clientY: number;
}

export interface GraphTouchPinch {
  centerX: number;
  centerY: number;
  distance: number;
}

export function classifyGraphWheel(event: GraphWheelLike): GraphWheelAction {
  return event.ctrlKey || event.metaKey ? "zoom" : "pan";
}

export function getGraphWheelZoomFactor(event: Pick<GraphWheelLike, "deltaX" | "deltaY">): number {
  const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  return Math.exp(-dominantDelta * 0.01);
}

export function getGraphWheelPanDelta(
  event: Pick<GraphWheelLike, "deltaX" | "deltaY">,
  zoom: number
): { x: number; y: number } {
  return {
    x: event.deltaX / zoom,
    y: event.deltaY / zoom,
  };
}

export function classifyGraphGesture(event: GraphGestureLike): GraphGestureAction {
  if (!Number.isFinite(event.scale) || event.scale <= 0) {
    return "zoom";
  }
  return "zoom";
}

export function getGraphTouchPinch(touches: ArrayLike<GraphTouchPointLike>): GraphTouchPinch | null {
  if (touches.length < 2) return null;

  const first = touches[0];
  const second = touches[1];
  const deltaX = second.clientX - first.clientX;
  const deltaY = second.clientY - first.clientY;

  return {
    centerX: (first.clientX + second.clientX) / 2,
    centerY: (first.clientY + second.clientY) / 2,
    distance: Math.hypot(deltaX, deltaY),
  };
}
