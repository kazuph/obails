import type { Note } from "../adapters/types";

/**
 * Main application state
 */
export interface AppState {
  /** Currently open note */
  currentNote: Note | null;
  /** Whether timeline panel is visible */
  showTimeline: boolean;
  /** Path of item targeted by context menu */
  contextMenuTargetPath: string;
  /** Whether context menu target is a directory */
  contextMenuTargetIsDir: boolean;
  /** Path of file being dragged */
  draggedFilePath: string | null;
}

/**
 * Mermaid fullscreen viewer state
 */
export interface MermaidState {
  /** Current zoom level */
  zoom: number;
  /** Initial zoom level (for reset) */
  initialZoom: number;
  /** Pan X offset */
  panX: number;
  /** Pan Y offset */
  panY: number;
  /** Whether user is currently panning */
  isPanning: boolean;
  /** Pan start X position */
  startX: number;
  /** Pan start Y position */
  startY: number;
  /** Natural width of the SVG */
  svgWidth: number;
  /** Natural height of the SVG */
  svgHeight: number;
  /** Minimap scale factor */
  minimapScale: number;
}

/**
 * Creates initial application state
 */
export function createInitialAppState(): AppState {
  return {
    currentNote: null,
    showTimeline: false,
    contextMenuTargetPath: "",
    contextMenuTargetIsDir: false,
    draggedFilePath: null,
  };
}

/**
 * Creates initial mermaid state
 */
export function createInitialMermaidState(): MermaidState {
  return {
    zoom: 1,
    initialZoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    startX: 0,
    startY: 0,
    svgWidth: 0,
    svgHeight: 0,
    minimapScale: 1,
  };
}

/**
 * Combined state for the entire application
 */
export interface CombinedState {
  app: AppState;
  mermaid: MermaidState;
}

/**
 * Creates initial combined state
 */
export function createInitialState(): CombinedState {
  return {
    app: createInitialAppState(),
    mermaid: createInitialMermaidState(),
  };
}
