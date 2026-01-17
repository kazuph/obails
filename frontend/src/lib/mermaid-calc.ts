/**
 * Zoom state for mermaid diagrams
 */
export interface ZoomState {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Clamps a zoom value between min and max bounds
 * @param zoom - Current zoom value
 * @param factor - Zoom factor to apply
 * @param min - Minimum allowed zoom (default: 0.1)
 * @param max - Maximum allowed zoom (default: 10)
 * @returns Clamped zoom value
 */
export function clampZoom(
  zoom: number,
  factor: number,
  min = 0.1,
  max = 10
): number {
  return Math.max(min, Math.min(max, zoom * factor));
}

/**
 * Calculates new pan position after zooming at a specific point
 * This keeps the point under the mouse cursor fixed during zoom
 *
 * @param mouseX - X coordinate relative to container
 * @param mouseY - Y coordinate relative to container
 * @param panX - Current X pan offset
 * @param panY - Current Y pan offset
 * @param zoomRatio - Ratio of new zoom to old zoom
 * @returns New pan position {x, y}
 */
export function calculateZoomPan(
  mouseX: number,
  mouseY: number,
  panX: number,
  panY: number,
  zoomRatio: number
): { x: number; y: number } {
  return {
    x: mouseX - (mouseX - panX) * zoomRatio,
    y: mouseY - (mouseY - panY) * zoomRatio,
  };
}

/**
 * Calculates centered position for an SVG in a viewport
 * @param svgWidth - Natural width of the SVG
 * @param svgHeight - Natural height of the SVG
 * @param viewportWidth - Width of the viewport
 * @param viewportHeight - Height of the viewport
 * @param zoom - Current zoom level
 * @param offsetX - X offset for positioning (default: 20)
 * @param offsetY - Y offset for positioning (default: 60)
 * @returns Centered position {x, y}
 */
export function calculateCenteredPosition(
  svgWidth: number,
  svgHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  offsetX = 20,
  offsetY = 60
): { x: number; y: number } {
  const scaledWidth = svgWidth * zoom;
  const scaledHeight = svgHeight * zoom;
  return {
    x: (viewportWidth - scaledWidth) / 2 + offsetX,
    y: (viewportHeight - scaledHeight) / 2 + offsetY,
  };
}

/**
 * Calculates fit-to-viewport zoom level
 * @param svgWidth - Natural width of the SVG
 * @param svgHeight - Natural height of the SVG
 * @param viewportWidth - Available viewport width
 * @param viewportHeight - Available viewport height
 * @returns Zoom level that fits the SVG within the viewport
 */
export function calculateFitZoom(
  svgWidth: number,
  svgHeight: number,
  viewportWidth: number,
  viewportHeight: number
): number {
  return Math.min(viewportHeight / svgHeight, viewportWidth / svgWidth);
}

/**
 * Calculates minimap scale to fit SVG within minimap bounds
 * @param svgWidth - Natural width of the SVG
 * @param svgHeight - Natural height of the SVG
 * @param minimapWidth - Width of the minimap (default: 184)
 * @param minimapHeight - Height of the minimap (default: 134)
 * @returns Scale factor for the minimap
 */
export function calculateMinimapScale(
  svgWidth: number,
  svgHeight: number,
  minimapWidth = 184,
  minimapHeight = 134
): number {
  return Math.min(minimapWidth / svgWidth, minimapHeight / svgHeight);
}
