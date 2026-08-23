import * as ConfigService from "../bindings/github.com/kazuph/obails/services/configservice.js";
import * as FileService from "../bindings/github.com/kazuph/obails/services/fileservice.js";
import * as NoteService from "../bindings/github.com/kazuph/obails/services/noteservice.js";
import * as LinkService from "../bindings/github.com/kazuph/obails/services/linkservice.js";
import * as SearchService from "../bindings/github.com/kazuph/obails/services/searchservice.js";
import * as WindowService from "../bindings/github.com/kazuph/obails/services/windowservice.js";
import * as GraphService from "../bindings/github.com/kazuph/obails/services/graphservice.js";
import * as StateService from "../bindings/github.com/kazuph/obails/services/stateservice.js";
import * as TranscribeService from "../bindings/github.com/kazuph/obails/services/transcribeservice.js";
import * as TransclusionService from "../bindings/github.com/kazuph/obails/services/transclusionservice.js";
import { AttachmentConfig, AttachmentLocation, FileInfo, Note, Timeline, Backlink, Link, Config, Graph, RecentlyDeletedItem, RecoverySnapshot, UnlinkedMention, ExplorerSessionState } from "../bindings/github.com/kazuph/obails/models/models.js";
import { Clipboard, Events } from "@wailsio/runtime";
import mermaid from "mermaid";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";
import ForceGraph from "force-graph";
import { clampEditorViewState } from "./lib/editor-view-state";
import {
  DEFAULT_DELETE_MODE,
  describeDeleteMode,
  normalizeDeleteMode,
  type DeleteMode,
} from "./lib/delete-mode";
import {
  describeRecentlyDeletedItem,
  describeRecoveryRestoreError,
  describeRecoverySnapshot,
} from "./lib/file-recovery";
import { lastImportedMarkdownPath } from "./lib/import-flow";
import {
  ATTACHMENT_LOCATION_OPTIONS,
  attachmentLocationNeedsFolder,
} from "./lib/attachment-settings";
import { insertAttachmentEmbeds } from "./lib/attachment-drop";
import {
  captureSaveIntent,
  createEditableDocument,
  isCurrentOpenGeneration,
  type EditableDocument,
  type SaveIntent,
} from "./lib/file-save-state";
import {
  DocumentHistory,
  type DocumentIdentity,
  type DocumentSnapshot,
} from "./lib/document-history";
import { PrimaryDocumentRuntime } from "./lib/primary-document-runtime";
import { DocumentRuntimeFactory } from "./lib/document-runtime-factory";
import { createRichSurface, hideLegacyRichSurfaceNoteTitles, type RichSurface, type SaveConflictControls } from "./lib/rich-surface-factory";
import {
  WorkspaceRuntimeController,
  type WorkspaceStateSnapshot,
  leafPaneIds,
  paneTabsFor,
  visibleLeafPaneIds,
} from "./lib/workspace-runtime-controller";
import { splitWeightsFromPointer, withoutWorkspacePanes, workspaceLayoutTree, type WorkspaceLayoutNode } from "./lib/workspace-layout";
import { bindLegacyPaneId, capturedClosePaneId, factorySurfacePaneIds, LAST_VISIBLE_PANE_CLOSE_REASON, paneCloseAffordance, shouldClearLegacyEditor, shouldClosePaneWithLastTab } from "./lib/workspace-pane-identity";
import { createEmptyPaneBody } from "./lib/workspace-pane-empty-body";
import { WorkspaceRefreshCoordinator } from "./lib/workspace-refresh";
import { resolveWindowDimensions } from "./lib/workspace-state";
import {
  DEFAULT_THEME,
  THEME_OPTIONS,
  VALID_THEMES,
  getAppliedTheme,
  isDarkTheme,
  normalizeThemeValue,
  resolveThemeSelection,
} from "./lib/theme";
import { parseMarkdown } from "./lib/markdown";
import { filterCommands, formatHotkeyForPlatform, isNoteSearchContext, matchesHotkey, resolveHotkeyCommand, suppressPrintableHotkeyInEditableTarget, type CommandDescriptor } from "./lib/command-registry";
import { editorSettingsStyle, type EditorSettings } from "./lib/editor-settings";
import { getImageEmbedDimensions, getPreviewEmbedKind, sanitizeEmbedHtml } from "./lib/embeds";
import { extractHeadings, renderOutlineHTML } from "./lib/headings";
import {
  clampZoom,
  calculateZoomPan,
  calculateCenteredPosition,
  calculateFitZoom,
  calculateMinimapScale,
} from "./lib/mermaid-calc";
import {
  isCacheValid,
  getCacheAgeText,
  createCacheEntry,
  saveCache,
  loadCache,
  clearCache,
  createGraphStructureSignature,
  canReuseGraphLayout,
  type GraphStructureSignature,
} from "./lib/graph-cache";
import {
  classifyGraphGesture,
  classifyGraphWheel,
  getGraphLabelFontSize,
  getGraphLabelText,
  getGraphNativeMagnifyZoomFactor,
  getGraphNodeRadius,
  getGraphRenderedNodeRadius,
  getGraphTouchPinch,
  getGraphWheelPanDelta,
  getGraphWheelZoomFactor,
  shouldShowGraphNodeLabel,
} from "./lib/graph-interactions";
import {
  GRAPH_DEPTH_OPTIONS,
  buildGraphOptions,
  canOpenGraphNode,
  getGraphDirection,
  hasActiveGraphFilters,
  resolveGraphEdgeNavigation,
  resolveGraphListNavigation,
  type GraphDepth,
  type GraphFilterValues,
  type GraphLike,
  type GraphNodeLike,
} from "./lib/graph-view";
import {
  getNextAudioPath,
  loadAudioLoopMode,
  loadDoneAudioPaths,
  storeAudioLoopMode,
  storeDoneAudioPaths,
  type AudioLoopMode,
} from "./lib/audio-playback";
import {
  buildChildPath,
  buildRenamePath,
  DEFAULT_FILE_TREE_SORT,
  extractExternalDropPaths,
  getDisplayName,
  hasExternalFileDrop,
  isBrowserFileDropWithoutPaths,
  filterMoveDestinationFolders,
  matchesVaultRelativePath,
  nextFileTreeSelection,
  nextSearchExpansionState,
  normalizeAndSortFileTree,
  resolveFileTreeSort,
  planMovesToFolder,
  rewritePathAfterMove,
  shouldIgnoreTreeClick,
  type FileTreeSort,
  type ItemKind,
} from "./lib/file-tree-ops";
import { renderIcon, setButtonIcon, setButtonIconWithLabel, type IconName } from "./lib/icons";
import { appendFileTreeItemContent, countMarkdownNotes } from "./lib/file-tree-view";
import { describeTreeItem, moveMenuIndex } from "./lib/accessibility-recovery";
import {
  getQuickSwitcherResults,
  type QuickSwitcherNote,
  type QuickSwitcherResult,
} from "./lib/quick-switcher";
import {
  findFragmentLine,
  getCreatePathForInternalLink,
  getWikiLinkQueryAtCursor,
  getWikiLinkSuggestions,
  parseInternalLinkTarget,
  type WikiLinkSuggestion,
} from "./lib/link-navigation";
import {
  createVaultSearchOptions,
  type VaultSearchSort,
} from "./lib/vault-search";
import {
  PLAYBACK_SPEEDS,
  DEFAULT_PLAYBACK_SPEED,
  formatSpeedLabel,
  loadStoredSpeed,
  storeSpeed,
} from "./lib/playback-speed";
import { transcriptPathForAudio } from "./lib/transcript";
import { formatPlaybackTime } from "./lib/time";
import {
  RIGHT_SIDEBAR_LAYOUT_KEY,
  RIGHT_SIDEBAR_SECTIONS,
  defaultRightSidebarLayout,
  normalizeRightSidebarLayout,
  toggleRightSidebarSection,
  type RightSidebarLayout,
  type RightSidebarSectionId,
} from "./lib/right-sidebar-layout";
import { workspaceLeafRestoreTargets } from "./lib/workspace-restore";
import { isCurrentBinaryOpen } from "./lib/binary-open-guard";
import { applySidebarVisibility, sidebarVisibilityForActivePane } from "./lib/sidebar-visibility";
import { savedWorkspaceNames as namesFromWorkspaceSnapshot } from "./lib/workspace-saved-names";
import {
  isExactWorkspaceName,
  mergeNamedWorkspacePaletteCommands,
  parseNamedWorkspaceCommand,
  type NamedWorkspaceAction,
} from "./lib/named-workspace-commands";
import { createWorkspacePaneTabStrip } from "./lib/workspace-pane-tab-strip";
import { installFilenameInputKeyboard } from "./lib/composition-submit-guard";
import { buildOperationStatusView, describeHumanOperationError } from "./lib/operation-status";
import { updatePaneSidebarCache, rewritePaneSidebarCachePath, type PaneSidebarCache } from "./lib/pane-sidebar-state";
import * as pdfjsLib from "pdfjs-dist";

// Setup PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

// Platform detection
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Helper to check for the correct modifier key (Cmd on macOS, Ctrl on others)
function isModKey(e: KeyboardEvent): boolean {
    return isMac ? e.metaKey : e.ctrlKey;
}

// State
let currentNote: Note | null = null;
let activePaneId = "main";
const documentRuntimeFactory = new DocumentRuntimeFactory(saveCapturedIntent);
let primaryDocumentRuntime = documentRuntimeFactory.forPane(activePaneId);
let documentHistory: DocumentHistory = primaryDocumentRuntime.history;
type PaneViewState = {
    note: Note | null;
    audioPath: string | null;
    htmlPath: string | null;
    textPath: string | null;
    markdownContent: string;
    htmlContent: string;
    textContent: string;
    editorSelection: { start: number; end: number; scrollTop: number };
    previewLinkGeneration: number;
    previewEmbedGeneration: number;
    linkPanelGeneration: number;
};
const paneViewStates = new Map<string, PaneViewState>();
type PaneSidebarState = PaneSidebarCache<Backlink, UnlinkedMention, Link>;
const paneSidebarStates = new Map<string, PaneSidebarState>();
const richLinkPanelRequestGenerations = new Map<string, number>();
const richPreviewLinkStateGenerations = new WeakMap<HTMLElement, number>();
const richPreviewEmbedRenderGenerations = new WeakMap<HTMLElement, number>();

function saveActivePaneViewState() {
    paneViewStates.set(activePaneId, {
        note: currentNote,
        audioPath: currentAudioPath,
        htmlPath: currentHtmlPath,
        textPath: currentTextPath,
        markdownContent: lastLoadedMarkdownContent,
        htmlContent: lastLoadedHtmlContent,
        textContent: lastLoadedTextContent,
        editorSelection: {
            start: editor?.selectionStart ?? 0,
            end: editor?.selectionEnd ?? 0,
            scrollTop: editor?.scrollTop ?? 0,
        },
        previewLinkGeneration: previewLinkStateGeneration,
        previewEmbedGeneration: previewEmbedRenderGeneration,
        linkPanelGeneration: linkPanelRequestGeneration,
    });
}

function restoreActivePaneViewState() {
    const state = paneViewStates.get(activePaneId);
    if (!state) return;
    currentNote = state.note;
    currentAudioPath = state.audioPath;
    currentHtmlPath = state.htmlPath;
    currentTextPath = state.textPath;
    lastLoadedMarkdownContent = state.markdownContent;
    lastLoadedHtmlContent = state.htmlContent;
    lastLoadedTextContent = state.textContent;
    previewLinkStateGeneration = state.previewLinkGeneration;
    previewEmbedRenderGeneration = state.previewEmbedGeneration;
    linkPanelRequestGeneration = state.linkPanelGeneration;
    if (editor) {
        editor.selectionStart = Math.min(state.editorSelection.start, editor.value.length);
        editor.selectionEnd = Math.min(state.editorSelection.end, editor.value.length);
        editor.scrollTop = state.editorSelection.scrollTop;
    }
}
let lastOpenedFilePersistence: Promise<void> = Promise.resolve();
let currentAudioPath: string | null = null;
let latestFileTree: FileInfo[] = [];
let audioLoopMode: AudioLoopMode = loadAudioLoopMode(window.localStorage);
let doneAudioPaths: Set<string> = loadDoneAudioPaths(window.localStorage);
let appThemeFromConfig: string | null = null;
let deleteMode: DeleteMode = DEFAULT_DELETE_MODE;
let showTimeline = false;
let showGraph = false;
let contextMenuTargetPath: string = "";
let contextMenuTargetIsDir: boolean = false;
let contextMenuRestoreFocus: HTMLElement | null = null;
let retrySettingsAction: (() => Promise<void>) | null = null;
let retryOperationAction: (() => Promise<void>) | null = null;
let draggedFilePaths: string[] = [];
let selectedFilePaths = new Set<string>();
let fileTreeSelectionAnchor: string | null = null;
let searchExpansionSnapshot: Set<string> | null = null;
let fileTreeSort: FileTreeSort = DEFAULT_FILE_TREE_SORT;
let fileTreeAutoReveal = true;
let graphInstance: ReturnType<typeof ForceGraph> | null = null;
let graphSelectionData: Graph | null = null;
let selectedGraphNodeID: string | null = null;
let graphLayoutCanPersist = false;
let graphRestoreFocus: HTMLElement | null = null;
let lastSyncedOpenedFile: string = "";
let fileTreeWatchTimerId: ReturnType<typeof window.setInterval> | null = null;
let isFileTreeWatchRunning = false;
let fileTreeSignature = "";
let suppressFileTreeClickUntil = 0;
let suppressFileTreeClickPath = "";
let graphInteractionAbortController: AbortController | null = null;
let graphInitialPinchZoom = 1;
let graphInitialTouchDistance = 0;
let graphInitialTouchZoom = 1;
let itemFormMode: "create" | "rename" = "create";
let itemFormKind: ItemKind = "file";
let itemFormTargetPath = "";
let filenameInputKeyboard: ReturnType<typeof installFilenameInputKeyboard> | null = null;
let itemFormTargetFolder = "";
let lastLoadedMarkdownContent = "";
let lastLoadedHtmlContent = "";
let currentTextPath: string | null = null;
let lastLoadedTextContent = "";
const FILE_TREE_WATCH_INTERVAL_MS = 350;

// Keyboard navigation state
let fileTreeFocused = false;
let keyboardSelectedIndex = -1;
let searchSelectionIndex = -1; // For Ctrl+N/P navigation in search input
let quickSwitcherNotes: QuickSwitcherNote[] = [];
let quickSwitcherResults: QuickSwitcherResult[] = [];
let quickSwitcherSelectedIndex = -1;
let quickSwitcherRestoreFocus: HTMLElement | null = null;
let quickSwitcherLoadGeneration = 0;
const QUICK_SWITCHER_RECENT_STORAGE_KEY = "obails.quick-switcher.recent-notes";
let linkSuggestionNotes: QuickSwitcherNote[] = [];
let linkSuggestionResults: WikiLinkSuggestion[] = [];
let linkSuggestionSelectedIndex = -1;
let linkSuggestionLoadGeneration = 0;
let previewLinkStateGeneration = 0;
let previewEmbedRenderGeneration = 0;
let linkPanelRequestGeneration = 0;
let pendingBrokenLinkTarget: string | null = null;
let brokenLinkRestoreFocus: HTMLElement | null = null;
type VaultSearchResult = {
    path: string;
    title: string;
    line?: number;
    context?: string;
    matchCount: number;
};
let vaultSearchResults: VaultSearchResult[] = [];
let vaultSearchSelectedIndex = -1;
let vaultSearchRestoreFocus: HTMLElement | null = null;
let vaultSearchGeneration = 0;
let selectedRecoverySnapshot: RecoverySnapshot | null = null;
let loadedRecoverySnapshotPath = "";
let recoverySnapshotSaveError: string | null = null;
let recoverySnapshotRequestInFlight = false;
let workspaceSnapshot: WorkspaceStateSnapshot | null = null;
const workspaceRefreshCoordinator = new WorkspaceRefreshCoordinator();
const paneSurfaces = new Map<string, RichSurface>();
const paneTabStrips = new Map<string, HTMLElement>();
const paneActionClusters = new Map<string, HTMLElement>();
type RichNoteSearchController = { open: () => void; close: () => void; refresh: () => void };
const richNoteSearchControllers = new Map<string, RichNoteSearchController>();
let legacySurfacePaneId = activePaneId;
let legacyRichSurfaceRoot: HTMLElement | null = null;
let legacySurfaceAssigned = false;
type PopoutRoute = { paneId: string; popoutId: string };
let popoutRoute: PopoutRoute | null = null;

function mountLegacyRichSurface() {
    if (workspaceHost.querySelector(".legacy-rich-surface")) return;
    const root = document.createElement("section");
    root.className = "rich-surface legacy-rich-surface";
    root.dataset.paneId = legacySurfacePaneId;
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", `Document pane ${legacySurfacePaneId}`);
    editor.setAttribute("aria-label", `Editor in pane ${legacySurfacePaneId}`);
    htmlEditor.setAttribute("aria-label", `HTML editor in pane ${legacySurfacePaneId}`);
    root.addEventListener("pointerdown", () => {
        void activateWorkspacePaneFromUi(legacySurfacePaneId);
    });
    root.append(editorContainer, timelinePanel, imageViewer, pdfViewer, htmlEditorContainer);
    hideLegacyRichSurfaceNoteTitles(root);
    legacyRichSurfaceRoot = root;
    workspaceHost.hidden = false;
    workspaceHost.append(root);
}

function ensurePaneSurface(paneId: string): RichSurface {
    const existing = paneSurfaces.get(paneId);
    if (existing) return existing;
    const surface = createRichSurface(document, paneId);
    setRichSurfaceIcons(surface);
    if (editorSettings) applyRichSurfaceEditorSettings(surface, editorSettings);
    paneSurfaces.set(paneId, surface);
    workspaceHost.append(surface.root);
    return surface;
}

function setRichSurfaceIcons(surface: RichSurface) {
    setButtonIcon(surface.noteSearchPreviousButton, "page-single");
    setButtonIcon(surface.noteSearchNextButton, "page-continuous");
    setButtonIcon(surface.noteSearchCloseButton, "close");
    setButtonIcon(surface.imageFullscreenButton, "file-image");
    setButtonIcon(surface.pdfViewModeButton, "page-single");
    setButtonIcon(surface.pdfPreviousPageButton, "page-single");
    setButtonIcon(surface.pdfNextPageButton, "page-continuous");
    setButtonIcon(surface.pdfZoomOutButton, "file-pdf");
    setButtonIcon(surface.pdfZoomInButton, "file-pdf");
    setButtonIcon(surface.pdfFullscreenButton, "file-pdf");
}

function removeMissingPaneSurfaces(snapshot: WorkspaceStateSnapshot) {
    const paneIds = new Set(leafPaneIds(snapshot.paneTree));
    for (const [paneId, surface] of paneSurfaces) {
        if (paneIds.has(paneId)) continue;
        surface.root.remove();
        paneSurfaces.delete(paneId);
    }
}

function assignInitialLegacySurface(snapshot: WorkspaceStateSnapshot) {
    if (!legacyRichSurfaceRoot) return;
    const paneIds = leafPaneIds(snapshot.paneTree);
    const nextLegacyPaneId = bindLegacyPaneId({
        assigned: legacySurfaceAssigned,
        currentLegacyPaneId: legacySurfacePaneId,
        paneIds,
        snapshotActivePaneId: snapshot.activePaneId,
    });
    if (!legacySurfaceAssigned || nextLegacyPaneId !== legacySurfacePaneId) {
        legacySurfacePaneId = nextLegacyPaneId;
        legacyRichSurfaceRoot.dataset.paneId = legacySurfacePaneId;
        legacyRichSurfaceRoot.setAttribute("aria-label", `Document pane ${legacySurfacePaneId}`);
        editor.setAttribute("aria-label", `Editor in pane ${legacySurfacePaneId}`);
        htmlEditor.setAttribute("aria-label", `HTML editor in pane ${legacySurfacePaneId}`);
    }
    legacySurfaceAssigned = true;
}

function renderWorkspaceLayout(snapshot: WorkspaceStateSnapshot) {
    const roots = new Map<string, HTMLElement>();
    if (legacyRichSurfaceRoot) roots.set(legacySurfacePaneId, legacyRichSurfaceRoot);
    for (const [paneId, surface] of paneSurfaces) roots.set(paneId, surface.root);
    const canResizeSplits = !popoutRoute && !(snapshot.popoutWindows?.length);
    const paneIdsForNode = (node: WorkspaceLayoutNode): string[] => node.paneId
        ? [node.paneId]
        : node.children.flatMap(paneIdsForNode);
    const renderNode = (node: WorkspaceLayoutNode, path: ReadonlyArray<number>): HTMLElement => {
        if (node.paneId) {
            const slot = document.createElement("section");
            slot.className = "workspace-pane-slot";
            slot.dataset.paneId = node.paneId;
            slot.dataset.active = node.paneId === activePaneId ? "true" : "false";
            slot.style.flexGrow = String(node.weight);
            slot.addEventListener("pointerdown", () => {
                void activateWorkspacePaneFromUi(node.paneId);
            });
            const tabStrip = paneTabStrips.get(node.paneId);
            if (tabStrip) slot.append(tabStrip);
            const root = roots.get(node.paneId);
            if (root) {
                root.querySelector(":scope > .workspace-pane-actions")?.remove();
                const actionCluster = paneActionClusters.get(node.paneId);
                if (actionCluster) root.prepend(actionCluster);
                slot.append(root);
            }
            return slot;
        }
        const split = document.createElement("section");
        split.className = "workspace-split";
        split.dataset.splitDirection = node.direction || "horizontal";
        split.style.flexGrow = String(node.weight);
        for (let index = 0; index < node.children.length; index += 1) {
            split.append(renderNode(node.children[index], [...path, index]));
            if (!canResizeSplits || index === node.children.length - 1) continue;
            const separator = document.createElement("div");
            separator.className = `resize-handle ${node.direction === "horizontal" ? "vertical" : "horizontal"} workspace-split-resize`;
            separator.setAttribute("role", "separator");
            separator.setAttribute("aria-orientation", node.direction === "horizontal" ? "vertical" : "horizontal");
            separator.setAttribute("aria-label", `Resize panes ${paneIdsForNode(node.children[index]).join(", ")} and ${paneIdsForNode(node.children[index + 1]).join(", ")}`);
            separator.addEventListener("pointerdown", (event) => {
                separator.setPointerCapture(event.pointerId);
                const finish = (upEvent: PointerEvent) => {
                    separator.removeEventListener("pointerup", finish);
                    separator.removeEventListener("pointercancel", cancel);
                    const rect = split.getBoundingClientRect();
                    const offset = node.direction === "horizontal" ? upEvent.clientX - rect.left : upEvent.clientY - rect.top;
                    const size = node.direction === "horizontal" ? rect.width : rect.height;
                    const weights = splitWeightsFromPointer(node, [], index, offset, size);
                    if (!weights) return;
                    void workspaceController.updateSplitWeights(path, weights).catch((error) => {
                        announceOperation(`Could not resize panes: ${describeOperationError(error)}.`);
                    });
                };
                const cancel = () => {
                    separator.removeEventListener("pointerup", finish);
                    separator.removeEventListener("pointercancel", cancel);
                };
                separator.addEventListener("pointerup", finish);
                separator.addEventListener("pointercancel", cancel);
            });
            split.append(separator);
        }
        return split;
    };
    if (popoutRoute) {
        const root = roots.get(popoutRoute.paneId);
        const slot = document.createElement("section");
        slot.className = "workspace-pane-slot";
        slot.dataset.paneId = popoutRoute.paneId;
        slot.dataset.active = popoutRoute.paneId === activePaneId ? "true" : "false";
        const tabStrip = paneTabStrips.get(popoutRoute.paneId);
        if (tabStrip) slot.append(tabStrip);
        if (root) {
            root.querySelector(":scope > .workspace-pane-actions")?.remove();
            const actionCluster = paneActionClusters.get(popoutRoute.paneId);
            if (actionCluster) root.prepend(actionCluster);
            slot.append(root);
        }
        workspaceHost.replaceChildren(slot);
        return;
    }
    const popoutPaneIds = new Set((snapshot.popoutWindows ?? []).map((popout) => popout.paneId));
    const layout = withoutWorkspacePanes(workspaceLayoutTree(snapshot.paneTree), popoutPaneIds);
    workspaceHost.replaceChildren(...(layout ? [renderNode(layout, [])] : []));
}

function activeRichSurface(): RichSurface | null {
    return paneSurfaces.get(activePaneId) || null;
}

function richSurfaceForPane(paneId: string): RichSurface | null {
    return paneSurfaces.get(paneId) || null;
}

function activeEditorElement(): HTMLTextAreaElement {
    return activeRichSurface()?.editor || editor;
}

function activeHtmlEditorElement(): HTMLTextAreaElement {
    return activeRichSurface()?.htmlEditor || htmlEditor;
}

function focusWorkspacePane(paneId: string) {
    const surface = paneSurfaces.get(paneId);
    const target = surface?.editor || (paneId === legacySurfacePaneId ? editor : null);
    if (!target || document.activeElement === target) return;
    target.focus({ preventScroll: true });
}

function showEmptyForPane(paneId: string) {
    const surface = paneSurfaces.get(paneId);
    if (!surface) return;
    surface.editorContainer.style.display = "flex";
    surface.imageViewer.style.display = "none";
    surface.audioViewer.style.display = "none";
    surface.pdfViewer.style.display = "none";
    surface.htmlEditorContainer.style.display = "none";
    surface.timelinePanel.style.display = "none";
    surface.editor.value = "";
    surface.preview.replaceChildren(createEmptyPaneBody(document, paneId, (targetPaneId) => {
        void activateWorkspacePaneFromUi(targetPaneId);
    }));
    surface.previewTitle.textContent = "Preview";
    surface.outlineList.innerHTML = '<div class="outline-empty">Headings you write will gather here</div>';
}

function showEmptyForActivePane() {
    const surface = activeRichSurface();
    if (!surface) {
        if (shouldClearLegacyEditor(activePaneId, legacySurfacePaneId, false)) showEmptyMainPane();
        return;
    }
    showEmptyForPane(activePaneId);
}

function hideRichSurfaceViewers(surface: RichSurface) {
    if (richPdfFullscreen?.surface === surface) {
        richPdfFullscreen = null;
        pdfFullscreenOverlay.style.display = "none";
    }
    surface.editorContainer.style.display = "none";
    surface.imageViewer.style.display = "none";
    surface.audioViewer.style.display = "none";
    surface.pdfViewer.style.display = "none";
    surface.htmlEditorContainer.style.display = "none";
    surface.timelinePanel.style.display = "none";
}

function canPublishRichBinary(surface: RichSurface, runtime: PrimaryDocumentRuntime, generation: number): boolean {
    return isCurrentBinaryOpen(
        { paneId: surface.paneId, generation },
        { paneId: surface.paneId, generation: runtime.openGeneration },
    ) && documentRuntimeFactory.canPublishLocal(surface.paneId, runtime, generation);
}

function installRichSurfaceEditorListeners(surface: RichSurface, runtime: PrimaryDocumentRuntime) {
    if (surface.root.dataset.listenersInstalled === "true") return;
    surface.root.dataset.listenersInstalled = "true";
    let query = "";
    let matches: HTMLElement[] = [];
    let matchIndex = -1;
    const clearMatches = () => {
        for (const mark of surface.preview.querySelectorAll<HTMLElement>("mark.note-search-match")) {
            const parent = mark.parentNode;
            mark.replaceWith(document.createTextNode(mark.textContent || ""));
            parent?.normalize();
        }
        matches = [];
        matchIndex = -1;
    };
    const updateCount = () => {
        surface.noteSearchCount.textContent = query.trim() && matches.length
            ? `${matchIndex + 1}/${matches.length}`
            : "0/0";
    };
    const selectMatch = (next: number) => {
        if (!matches.length) {
            matchIndex = -1;
            updateCount();
            return;
        }
        matches.forEach((match) => match.classList.remove("active"));
        matchIndex = (next + matches.length) % matches.length;
        const match = matches[matchIndex];
        match.classList.add("active");
        match.scrollIntoView({ block: "center", behavior: "smooth" });
        updateCount();
    };
    const refreshSearch = () => {
        if (surface.noteSearch.hidden && !query) return;
        clearMatches();
        query = surface.noteSearchInput.value;
        if (!query.trim()) {
            updateCount();
            return;
        }
        matches = highlightTextMatches(surface.preview, query);
        selectMatch(0);
    };
    const closeSearch = () => {
        surface.noteSearch.hidden = true;
        surface.noteSearchInput.value = "";
        query = "";
        clearMatches();
        updateCount();
    };
    const openSearch = () => {
        surface.noteSearch.hidden = false;
        surface.noteSearchInput.value = query;
        refreshSearch();
        window.requestAnimationFrame(() => {
            surface.noteSearchInput.focus();
            surface.noteSearchInput.select();
        });
    };
    richNoteSearchControllers.set(surface.paneId, { open: openSearch, close: closeSearch, refresh: refreshSearch });
    surface.root.addEventListener("pointerdown", () => {
        void activateWorkspacePaneFromUi(surface.paneId);
    });
    const renameCurrentNote = async () => {
        await activateWorkspacePaneFromUi(surface.paneId);
        if (runtime.currentFilePath) showRenameForm(runtime.currentFilePath, false);
    };
    surface.editorTitle.addEventListener("click", () => void renameCurrentNote());
    surface.editorTitle.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void renameCurrentNote();
        }
    });
    setupPreviewInteractions(surface.preview, () => activateWorkspacePaneFromUi(surface.paneId));
    surface.imageFullscreenButton.addEventListener("click", () => {
        if (!surface.imagePreview.src) return;
        imageFsPreview.src = surface.imagePreview.src;
        imageFsTitle.textContent = surface.imageTitle.textContent || "Image";
        imageFullscreenOverlay.style.display = "flex";
    });
    surface.pdfPreviousPageButton.addEventListener("click", () => void richPdfPreviousPage(surface));
    surface.pdfNextPageButton.addEventListener("click", () => void richPdfNextPage(surface));
    surface.pdfZoomInButton.addEventListener("click", () => void richPdfZoomIn(surface));
    surface.pdfZoomOutButton.addEventListener("click", () => void richPdfZoomOut(surface));
    surface.pdfViewModeButton.addEventListener("click", () => void toggleRichPdfViewMode(surface));
    surface.pdfFullscreenButton.addEventListener("click", () => void openRichPdfFullscreen(surface));
    surface.editor.addEventListener("input", () => {
        const document = runtime.activeEditableDocument;
        if (!document || document.kind !== "markdown" || document.failure) return;
        document.failure = null;
        runtime.history.recordEdit({ path: document.snapshot.path, kind: document.kind }, {
            content: surface.editor.value,
            selectionStart: surface.editor.selectionStart,
            selectionEnd: surface.editor.selectionEnd,
            scrollTop: surface.editor.scrollTop,
        });
        renderRichPreview(surface, runtime, document);
        syncLineNumberGutters();
        updatePaneSidebarContent(surface.paneId, document.snapshot.path, surface.editor.value);
        if (surface.paneId === activePaneId) renderActiveSharedSidebar();
        refreshSearch();
        documentRuntimeFactory.scheduleSave(surface.paneId, captureSaveIntent(document, surface.editor.value), EDITOR_SAVE_DELAY_MS);
    });
    surface.htmlEditor.addEventListener("input", () => {
        const document = runtime.activeEditableDocument;
        if (!document || document.kind !== "html" || document.failure) return;
        document.failure = null;
        surface.htmlPreview.srcdoc = surface.htmlEditor.value;
        runtime.history.recordEdit({ path: document.snapshot.path, kind: document.kind }, {
            content: surface.htmlEditor.value,
            selectionStart: surface.htmlEditor.selectionStart,
            selectionEnd: surface.htmlEditor.selectionEnd,
            scrollTop: surface.htmlEditor.scrollTop,
        });
        documentRuntimeFactory.scheduleSave(surface.paneId, captureSaveIntent(document, surface.htmlEditor.value), EDITOR_SAVE_DELAY_MS);
    });
    surface.noteSearchInput.addEventListener("input", refreshSearch);
    surface.noteSearchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            selectMatch(matchIndex + (event.shiftKey ? -1 : 1));
        } else if (event.key === "Escape") {
            event.preventDefault();
            closeSearch();
        }
    });
    surface.noteSearchPreviousButton.addEventListener("click", () => selectMatch(matchIndex - 1));
    surface.noteSearchNextButton.addEventListener("click", () => selectMatch(matchIndex + 1));
    surface.noteSearchCloseButton.addEventListener("click", closeSearch);
    surface.timelineSubmitButton.addEventListener("click", () => void submitTimeline(surface));
    surface.timelineInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submitTimeline(surface);
        }
    });
}

async function openRichSurfaceFile(path: string, resolvedType: string, paneId = activePaneId): Promise<void> {
    const surface = richSurfaceForPane(paneId);
    if (!surface) return;
    const runtime = documentRuntimeFactory.forPane(paneId);
    const generation = runtime.beginOpen();
    const canPublishShared = () => documentRuntimeFactory.canPublishShared(paneId, runtime, generation, activePaneId);
    hideRichSurfaceViewers(surface);
    surface.rightSidebar.style.display = "none";
    surface.rightSidebarResizeHandle.style.display = "none";
    installRichSurfaceEditorListeners(surface, runtime);

    if (resolvedType === "audio") {
        runtime.setNonEditablePath(path);
        if (!canPublishRichBinary(surface, runtime, generation)) return;
        surface.audioPlayer.src = `/media/audio?path=${encodeURIComponent(path)}`;
        surface.audioTitle.textContent = path.split("/").pop() || "Audio";
        surface.audioViewer.style.display = "flex";
        if (canPublishShared()) {
            renderActiveSharedSidebar();
            await openAudio(path);
        }
        return;
    }
    if (resolvedType === "image") {
        runtime.setNonEditablePath(path);
        const base64Data = await FileService.ReadBinaryFile(path);
        if (!canPublishRichBinary(surface, runtime, generation)) return;
        const ext = path.split(".").pop()?.toLowerCase() || "png";
        surface.imagePreview.src = `data:${getMimeTypeFromExt(ext)};base64,${base64Data}`;
        surface.imageTitle.textContent = path.split("/").pop() || "Image";
        surface.imageViewer.style.display = "flex";
        if (canPublishShared()) {
            renderActiveSharedSidebar();
            updateFileTreeSelection(path);
        }
        return;
    }
    if (resolvedType === "pdf") {
        runtime.setNonEditablePath(path);
        await openRichPdf(path, surface, runtime, generation);
        if (canPublishShared()) {
            renderActiveSharedSidebar();
            updateFileTreeSelection(path);
        }
        return;
    }
    if (resolvedType === "html") {
        const identity = { path, kind: "html" as const };
        const opened = await runtime.coordinateOpen({
            path,
            kind: "html",
            generation,
            load: async () => ({ snapshot: await FileService.ReadSnapshot(path), value: null }),
            commit: (document) => {
                restoreOrRebaseRichDocumentHistory(runtime, surface, document);
                surface.htmlPreview.srcdoc = surface.htmlEditor.value;
                surface.htmlEditorTitle.textContent = path.split("/").pop() || "HTML";
                surface.htmlEditorContainer.style.display = "flex";
                if (canPublishShared()) {
                    renderActiveSharedSidebar();
                    updateFileTreeSelection(path);
                }
            },
            fail: (error) => announceOperation(`Could not open ${path}: ${describeOperationError(error)}.`),
        });
        if (!opened) return;
        runtime.currentFilePath = path;
        if (canPublishShared()) {
            currentHtmlPath = path;
            currentTextPath = null;
            currentNote = null;
        }
        return;
    }
    if (resolvedType !== "markdown" && resolvedType !== "text") {
        runtime.setNonEditablePath(path);
        await openExternal(path);
        if (canPublishShared()) updateFileTreeSelection(path);
        return;
    }

    let loadedRichNote: Note | null = null;
    const identity = { path, kind: (resolvedType === "text" ? "text" : "markdown") as "text" | "markdown" };
    const opened = await runtime.coordinateOpen({
        path,
        kind: resolvedType === "text" ? "text" : "markdown",
        generation,
        load: async () => {
            const snapshot = await FileService.ReadSnapshot(path);
            loadedRichNote = resolvedType === "markdown" ? await NoteService.GetNote(path) : null;
            return { snapshot, value: loadedRichNote };
        },
        commit: (document) => {
            restoreOrRebaseRichDocumentHistory(runtime, surface, document);
            const content = surface.editor.value;
            surface.preview.innerHTML = resolvedType === "markdown" ? parseMarkdown(content) : `<pre class="plain-text-preview"></pre>`;
            if (resolvedType !== "markdown") {
                const plain = surface.preview.querySelector("pre");
                if (plain) plain.textContent = content;
            }
            surface.editorTitle.textContent = path.split("/").pop() || path;
            surface.previewTitle.textContent = "Preview";
            surface.editorContainer.style.display = "flex";
            if (resolvedType === "markdown") {
                enhanceRichPreview(surface, runtime, document);
                const headings = extractHeadings(content);
                surface.outlineList.innerHTML = renderOutlineHTML(headings);
                updatePaneSidebarContent(paneId, document.snapshot.path, content);
                void loadRichLinkPanels(paneId, runtime, document);
                if (canPublishShared()) {
                    renderActiveSharedSidebar();
                }
            }
            if (canPublishShared()) updateFileTreeSelection(path);
        },
        fail: (error) => announceOperation(`Could not open ${path}: ${describeOperationError(error)}.`),
    });
    if (!opened) {
        if (canPublishShared()) showEmptyForActivePane();
        return;
    }
    runtime.currentFilePath = path;
    if (canPublishShared()) {
        currentTextPath = resolvedType === "text" ? path : null;
        currentHtmlPath = null;
        currentNote = resolvedType === "markdown" ? loadedRichNote : null;
    }
}

const workspaceController = new WorkspaceRuntimeController(
    documentRuntimeFactory,
    {
        ensureWorkspace: (paneId) => StateService.EnsureWorkspace(paneId),
        activateWorkspacePane: (paneId) => StateService.ActivateWorkspacePane(paneId),
        openWorkspaceTab: (paneId, tab) => StateService.OpenWorkspaceTab(paneId, tab),
        openWorkspaceTabInPopout: (paneId, popoutId, tab) => StateService.OpenWorkspaceTabInPopout(paneId, popoutId, tab),
        activateWorkspaceTab: (paneId, path) => StateService.ActivateWorkspaceTab(paneId, path),
        activateWorkspaceTabInPopout: (paneId, popoutId, path) => StateService.ActivateWorkspaceTabInPopout(paneId, popoutId, path),
        closeWorkspaceTab: (paneId, path) => StateService.CloseWorkspaceTab(paneId, path),
        closeWorkspaceTabInPopout: (paneId, popoutId, path) => StateService.CloseWorkspaceTabInPopout(paneId, popoutId, path),
        rewriteWorkspaceTabsAfterMove: (previousPath, nextPath, isDir) => StateService.RewriteWorkspaceTabsAfterMove(previousPath, nextPath, isDir),
        splitWorkspacePane: (paneId, direction, newPaneId) => StateService.SplitWorkspacePane(paneId, direction, newPaneId),
        closeWorkspacePane: (paneId) => StateService.CloseWorkspacePane(paneId),
        updateWorkspaceSplitWeights: (path, weights) => StateService.UpdateWorkspaceSplitWeights([...path], [...weights]),
        saveNamedWorkspace: (name) => StateService.SaveNamedWorkspace(name),
        restoreNamedWorkspace: (name) => WindowService.RestoreNamedWorkspace(name),
        renameNamedWorkspace: (name, newName) => StateService.RenameNamedWorkspace(name, newName),
        deleteNamedWorkspace: (name) => StateService.DeleteNamedWorkspace(name),
    },
    (snapshot) => applyWorkspaceSnapshot(snapshot),
);

// DOM Elements
const fileTree = document.getElementById("file-tree")!;
const fileTreeStatus = document.getElementById("file-tree-status") as HTMLElement;
const fileTreeRetry = document.getElementById("file-tree-retry") as HTMLButtonElement;
const emptyVaultActions = document.getElementById("empty-vault-actions") as HTMLElement;
const operationStatusRow = document.getElementById("operation-status-row") as HTMLElement;
const operationStatus = document.getElementById("operation-status") as HTMLElement;
const operationRetry = document.getElementById("operation-retry") as HTMLButtonElement;
const operationDismiss = document.getElementById("operation-dismiss") as HTMLButtonElement;
const settingsStatus = document.getElementById("settings-status") as HTMLElement;
const settingsRetry = document.getElementById("settings-retry") as HTMLButtonElement;
const editor = document.getElementById("editor") as HTMLTextAreaElement;
const saveStatus = document.getElementById("save-status") as HTMLElement;
const saveStatusMessage = document.getElementById("save-status-message") as HTMLElement;
const saveStatusRetry = document.getElementById("save-status-retry") as HTMLButtonElement;
const saveStatusReload = document.getElementById("save-status-reload") as HTMLButtonElement;
const saveStatusClose = document.getElementById("save-status-close") as HTMLButtonElement;
const htmlSaveStatus = document.getElementById("html-save-status") as HTMLElement;
const htmlSaveStatusMessage = document.getElementById("html-save-status-message") as HTMLElement;
const htmlSaveStatusRetry = document.getElementById("html-save-status-retry") as HTMLButtonElement;
const htmlSaveStatusReload = document.getElementById("html-save-status-reload") as HTMLButtonElement;
const htmlSaveStatusClose = document.getElementById("html-save-status-close") as HTMLButtonElement;
const preview = document.getElementById("preview")!;
const linkSuggestions = document.getElementById("link-suggestions") as HTMLElement;
const noteSearch = document.getElementById("note-search") as HTMLElement;
const noteSearchInput = document.getElementById("note-search-input") as HTMLInputElement;
const noteSearchCount = document.getElementById("note-search-count") as HTMLElement;
const noteSearchPrev = document.getElementById("note-search-prev") as HTMLButtonElement;
const noteSearchNext = document.getElementById("note-search-next") as HTMLButtonElement;
const noteSearchClose = document.getElementById("note-search-close") as HTMLButtonElement;
const timelinePanel = document.getElementById("timeline-panel")!;
const editorContainer = document.querySelector(".editor-container") as HTMLElement;
const timelineInput = document.getElementById("timeline-input") as HTMLTextAreaElement;
const timelineTimeline = document.getElementById("timeline-list")!;
const backlinksList = document.getElementById("backlinks-list")!;
const outgoingLinksList = document.getElementById("outgoing-links-list")!;
const outlineList = document.getElementById("outline-list")!;
const rightSidebar = document.getElementById("right-sidebar") as HTMLElement;
const rightSidebarResizeHandle = document.getElementById("right-sidebar-resize") as HTMLElement;
const fileSearchInput = document.getElementById("file-search-input") as HTMLInputElement;
const fileSearchClear = document.getElementById("file-search-clear")!;
const quickSwitcherOverlay = document.getElementById("quick-switcher-overlay") as HTMLElement;
const quickSwitcherInput = document.getElementById("quick-switcher-input") as HTMLInputElement;
const quickSwitcherResultsList = document.getElementById("quick-switcher-results") as HTMLUListElement;
const brokenLinkOverlay = document.getElementById("broken-link-overlay") as HTMLElement;
const brokenLinkDescription = document.getElementById("broken-link-description") as HTMLElement;
const brokenLinkStatus = document.getElementById("broken-link-status") as HTMLElement;
const brokenLinkCreate = document.getElementById("broken-link-create") as HTMLButtonElement;
const brokenLinkCancel = document.getElementById("broken-link-cancel") as HTMLButtonElement;
const vaultSearchButton = document.getElementById("vault-search-btn") as HTMLButtonElement;
const vaultSearchOverlay = document.getElementById("vault-search-overlay") as HTMLElement;
const vaultSearchForm = document.getElementById("vault-search-form") as HTMLFormElement;
const vaultSearchInput = document.getElementById("vault-search-input") as HTMLInputElement;
const vaultSearchMatchCase = document.getElementById("vault-search-match-case") as HTMLInputElement;
const vaultSearchSort = document.getElementById("vault-search-sort") as HTMLSelectElement;
const vaultSearchContext = document.getElementById("vault-search-context") as HTMLInputElement;
const vaultSearchError = document.getElementById("vault-search-error") as HTMLElement;
const vaultSearchStatus = document.getElementById("vault-search-status") as HTMLElement;
const vaultSearchResultsList = document.getElementById("vault-search-results") as HTMLUListElement;
const recentlyDeletedOverlay = document.getElementById("recently-deleted-overlay") as HTMLElement;
const recentlyDeletedStatus = document.getElementById("recently-deleted-status") as HTMLElement;
const recentlyDeletedList = document.getElementById("recently-deleted-list") as HTMLUListElement;
const recoverySnapshotsOverlay = document.getElementById("recovery-snapshots-overlay") as HTMLElement;
const recoverySnapshotsStatus = document.getElementById("recovery-snapshots-status") as HTMLElement;
const recoverySnapshotsList = document.getElementById("recovery-snapshots-list") as HTMLUListElement;
const recoverySnapshotPath = document.getElementById("recovery-snapshot-path") as HTMLInputElement;
const recoverySnapshotContent = document.getElementById("recovery-snapshot-content") as HTMLTextAreaElement;
const recoverySnapshotRead = document.getElementById("recovery-snapshot-read") as HTMLButtonElement;
const recoverySnapshotRestore = document.getElementById("recovery-snapshot-restore") as HTMLButtonElement;
const recoverySnapshotRetry = document.getElementById("recovery-snapshot-retry") as HTMLButtonElement;

function describeOperationError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function clearOperationStatus() {
    operationStatus.textContent = "";
    retryOperationAction = null;
    operationRetry.hidden = true;
    operationDismiss.hidden = true;
    operationStatusRow.hidden = true;
    operationStatusRow.dataset.kind = "status";
    operationStatus.setAttribute("role", "status");
    operationStatus.setAttribute("aria-live", "polite");
}

function announceOperation(message: string, retry?: () => Promise<void>) {
    const view = buildOperationStatusView(message, retry || null);
    if (!view.message) {
        clearOperationStatus();
        return;
    }
    // One intentional status surface only — never leave a prior bare message visible.
    operationStatus.textContent = view.message;
    retryOperationAction = retry || null;
    operationRetry.hidden = !view.retryAvailable;
    operationDismiss.hidden = !view.dismissAvailable;
    operationStatusRow.hidden = false;
    operationStatusRow.dataset.kind = view.kind;
    operationStatus.setAttribute("role", view.kind);
    operationStatus.setAttribute("aria-live", view.kind === "alert" ? "assertive" : "polite");
}

async function reconcileStartupPopouts() {
    if (popoutRoute) return;
    try {
        await WindowService.ReconcilePopouts();
    } catch (error) {
        announceOperation(
            `Could not restore popout windows: ${describeOperationError(error)}.`,
            reconcileStartupPopouts,
        );
    }
}

function showSettingsFailure(message: string, retry: () => Promise<void>) {
    settingsStatus.textContent = message;
    retrySettingsAction = retry;
    settingsRetry.hidden = false;
}

function applyWorkspaceSnapshot(snapshot: WorkspaceStateSnapshot) {
    workspaceSnapshot = snapshot;
    syncWorkspaceApplicationMenu(snapshot);
    const paneIds = leafPaneIds(snapshot.paneTree);
    assignInitialLegacySurface(snapshot);
    const nextActivePaneId = popoutRoute?.paneId || snapshot.activePaneId || paneIds[0];
    const previousActivePaneId = activePaneId;
    const visiblePaneIds = popoutRoute ? [popoutRoute.paneId] : visibleLeafPaneIds(snapshot.paneTree, snapshot.popoutWindows);
    for (const paneId of factorySurfacePaneIds(visiblePaneIds, legacySurfacePaneId)) {
        ensurePaneSurface(paneId);
    }
    removeMissingPaneSurfaces(snapshot);
    if (nextActivePaneId) {
        if (nextActivePaneId !== activePaneId) saveActivePaneViewState();
        activePaneId = nextActivePaneId;
        primaryDocumentRuntime = documentRuntimeFactory.forPane(activePaneId);
        documentHistory = primaryDocumentRuntime.history;
        saveScheduler = primaryDocumentRuntime.saveScheduler;
        restoreActivePaneViewState();
    }
    renderWorkspacePaneTabs(snapshot, visiblePaneIds.length);
    renderWorkspaceLayout(snapshot);
    for (const paneId of visiblePaneIds) {
        if (!paneTabsFor(snapshot, paneId)?.tabs.length) showEmptyForPane(paneId);
    }
    workspaceHost.dataset.paneCount = String(visiblePaneIds.length);
    const activeDocument = primaryDocumentRuntime.activeEditableDocument;
    const activeFailure = activeDocument?.failure;
    if (activeDocument && activeFailure) {
        if (richSurfaceForPane(activePaneId)) {
            renderRichSaveFailure(activePaneId, primaryDocumentRuntime, activeDocument, activeFailure);
        } else {
            showSaveFailure(activeFailure);
        }
    }
    for (const [paneId, surface] of paneSurfaces) {
        surface.root.dataset.active = paneId === activePaneId ? "true" : "false";
        surface.rightSidebar.style.display = "none";
        surface.rightSidebarResizeHandle.style.display = "none";
    }
    renderActiveSharedSidebar();
    document.documentElement.dataset.activePaneId = activePaneId;
    if (legacyRichSurfaceRoot) legacyRichSurfaceRoot.dataset.active = legacySurfacePaneId === activePaneId ? "true" : "false";
    applyPopoutToolbarMode();
    if (nextActivePaneId && nextActivePaneId !== previousActivePaneId) {
        queueMicrotask(() => focusWorkspacePane(nextActivePaneId));
    }
}

function applyPopoutToolbarMode() {
    popoutPaneButton.hidden = Boolean(popoutRoute);
    rejoinPopoutButton.hidden = !popoutRoute;
    // Popout windows show only the note surface; the file explorer stays in the main window.
    document.body.classList.toggle("popout-window", Boolean(popoutRoute));
}

function renderWorkspacePaneTabs(snapshot: WorkspaceStateSnapshot, visiblePaneCount: number) {
    workspacePaneTabs.replaceChildren();
    workspacePaneTabs.hidden = true;
    paneTabStrips.clear();
    paneActionClusters.clear();
    const paneClose = paneCloseAffordance({ isPopout: Boolean(popoutRoute), visibleMainPaneCount: visiblePaneCount });
    for (const paneId of leafPaneIds(snapshot.paneTree)) {
        if (popoutRoute && paneId !== popoutRoute.paneId) continue;
        const pane = paneTabsFor(snapshot, paneId);
        const group = createWorkspacePaneTabStrip(
            document,
            paneId,
            pane,
            activePaneId,
            (path) => getDisplayName(path, "file"),
            {
                activateTab: (targetPaneId, path) => void activateWorkspaceTabFromUi(targetPaneId, path),
                closeTab: (targetPaneId, path) => void closeWorkspaceTabFromUi(targetPaneId, path),
                renameTab: (targetPaneId, path) => void renameWorkspaceTabFromUi(targetPaneId, path),
                activatePane: (targetPaneId) => void activateWorkspacePaneFromUi(targetPaneId),
                closePane: (targetPaneId) => void closeWorkspacePaneFromUi(targetPaneId),
                toggleSource: (targetPaneId) => void toggleSourceEditorForPane(targetPaneId),
                splitPaneRight: (targetPaneId) => void splitWorkspacePaneFromUi(targetPaneId, "horizontal"),
                splitPaneDown: (targetPaneId) => void splitWorkspacePaneFromUi(targetPaneId, "vertical"),
            },
            {
                paneClose,
                sourceVisible: isSourceEditorVisibleForPane(paneId),
                splitControls: popoutRoute ? "hidden" : "visible",
            },
        );
        // Keep the visible × from createWorkspacePaneTabStrip; icon injection hid AX names.
        group.querySelectorAll<HTMLButtonElement>(".workspace-pane-tab-close").forEach((button) => {
            const label = button.getAttribute("aria-label") || button.title || "Close tab";
            if (!button.textContent?.trim()) button.textContent = "×";
            button.setAttribute("aria-label", label);
            button.title = label;
        });
        const actionCluster = group.querySelector<HTMLElement>(".workspace-pane-actions");
        actionCluster?.remove();
        if (actionCluster) paneActionClusters.set(paneId, actionCluster);
        paneTabStrips.set(paneId, group);
    }
}

async function activateWorkspacePaneFromUi(paneId: string) {
    if (popoutRoute && paneId !== popoutRoute.paneId) return;
    document.documentElement.dataset.activePaneId = paneId;
    if (paneId === activePaneId) return;
    const snapshot = await workspaceController.activatePane(paneId);
    if (!snapshot) return;
    await openActiveWorkspaceTab(snapshot);
}

async function activateWorkspaceTabFromUi(paneId: string, path: string) {
    if (popoutRoute && paneId !== popoutRoute.paneId) return;
    try {
        if (!await validatePopoutPaneAction(paneId)) return;
        const snapshot = popoutRoute
            ? await workspaceController.activateTabInRoutedPopout(paneId, popoutRoute.popoutId, path)
            : await workspaceController.activateTab(paneId, path);
        if (!snapshot) return;
        await openFile(path, paneTabsFor(snapshot, paneId)?.tabs.find((tab) => tab.path === path)?.fileType || "other", { workspaceAlreadyOpen: true });
    } catch (error) {
        announceOperation(`Could not activate this tab: ${describeOperationError(error)}.`);
    }
}

async function closeWorkspaceTabFromUi(paneId: string, path: string) {
    if (popoutRoute && paneId !== popoutRoute.paneId) return;
    try {
        if (!popoutRoute && workspaceSnapshot) {
            const pane = paneTabsFor(workspaceSnapshot, paneId);
            const visiblePaneCount = visibleLeafPaneIds(workspaceSnapshot.paneTree, workspaceSnapshot.popoutWindows).length;
            if (shouldClosePaneWithLastTab(pane?.tabs.map((tab) => tab.path) ?? [], path, visiblePaneCount)) {
                await closeWorkspacePaneFromUi(paneId);
                return;
            }
        }
        if (!await validatePopoutPaneAction(paneId)) return;
        const snapshot = popoutRoute
            ? await workspaceController.closeTabInRoutedPopout(paneId, popoutRoute.popoutId, path)
            : await workspaceController.closeTab(paneId, path);
        if (!snapshot) return;
        if (popoutRoute && (paneTabsFor(snapshot, paneId)?.tabs.length ?? 0) === 0) {
            await WindowService.ClosePopout(popoutRoute.paneId, popoutRoute.popoutId);
            return;
        }
        if (paneId === activePaneId) await openActiveWorkspaceTab(snapshot);
    } catch (error) {
        announceOperation(`Could not close this tab: ${describeOperationError(error)}.`);
    }
}

async function renameWorkspaceTabFromUi(paneId: string, path: string) {
    if (popoutRoute && paneId !== popoutRoute.paneId) return;
    if (getFileTypeFromPath(path) !== "markdown") return;
    try {
        if (!await validatePopoutPaneAction(paneId)) return;
        const alreadyExactTab = paneId === activePaneId && primaryDocumentRuntime.currentFilePath === path;
        if (!alreadyExactTab) {
            await activateWorkspaceTabFromUi(paneId, path);
        }
        showRenameForm(path, false);
    } catch (error) {
        announceOperation(`Could not rename this tab: ${describeOperationError(error)}.`);
    }
}

async function openActiveWorkspaceTab(snapshot: WorkspaceStateSnapshot) {
    const pane = paneTabsFor(snapshot, activePaneId);
    const path = pane?.activeTabPath;
    const tab = path ? pane.tabs?.find((entry) => entry.path === path) : undefined;
    if (tab) {
        await openFile(tab.path, tab.fileType, { workspaceAlreadyOpen: true });
    } else {
        showEmptyForActivePane();
    }
}

async function restoreWorkspaceLeafTabs(snapshot: WorkspaceStateSnapshot) {
    const detachedPaneIds = new Set((snapshot.popoutWindows ?? []).map((popout) => popout.paneId));
    const visiblePaneIds = popoutRoute
        ? new Set([popoutRoute.paneId])
        : new Set(leafPaneIds(snapshot.paneTree).filter((paneId) => !detachedPaneIds.has(paneId)));
    const targets = workspaceLeafRestoreTargets(snapshot, activePaneId, visiblePaneIds);
    for (const { paneId } of targets) ensurePaneSurface(paneId);
    await Promise.all(targets.map(({ paneId, tab }) => openRichSurfaceFile(tab.path, tab.fileType, paneId)));
}

async function splitActiveWorkspacePane(direction: "horizontal" | "vertical") {
    if (popoutRoute) return;
    const newPaneId = `pane-${crypto.randomUUID()}`;
    const snapshot = await workspaceController.splitPane(activePaneId, direction, newPaneId);
    if (snapshot) await openActiveWorkspaceTab(snapshot);
}

async function closeWorkspacePaneFromUi(paneId: string) {
    if (popoutRoute) return;
    try {
        const visiblePaneIds = workspaceSnapshot
            ? visibleLeafPaneIds(workspaceSnapshot.paneTree, workspaceSnapshot.popoutWindows)
            : [];
        if (visiblePaneIds.length <= 1) {
            announceOperation(LAST_VISIBLE_PANE_CLOSE_REASON);
            return;
        }
        const snapshot = await workspaceController.closePane(paneId);
        if (!snapshot) {
            announceOperation("Could not close this pane.");
            return;
        }
        await openActiveWorkspaceTab(snapshot);
    } catch (error) {
        announceOperation(`Could not close this pane: ${describeHumanOperationError(error, "the pane could not be closed")}.`);
    }
}

async function closeActiveWorkspaceTab() {
    const paneId = popoutRoute?.paneId
        || capturedClosePaneId(document.documentElement.dataset.activePaneId || "", activePaneId);
    const pane = workspaceSnapshot ? paneTabsFor(workspaceSnapshot, paneId) : undefined;
    const path = pane?.activeTabPath;
    if (!path) return;
    await closeWorkspaceTabFromUi(paneId, path);
}

async function closeActiveWorkspacePane() {
    if (popoutRoute) return;
    const paneId = capturedClosePaneId(document.documentElement.dataset.activePaneId || "", activePaneId);
    await closeWorkspacePaneFromUi(paneId);
}

function getPopoutRoute(): PopoutRoute | null {
    const query = new URLSearchParams(window.location.search);
    const paneId = query.get("popout");
    const popoutId = query.get("id");
    return paneId && popoutId ? { paneId, popoutId } : null;
}

async function validatePopoutPaneAction(paneId: string): Promise<boolean> {
    if (!popoutRoute) return true;
    if (paneId !== popoutRoute.paneId) return false;
    try {
        await WindowService.ValidatePopoutRoute(popoutRoute.paneId, popoutRoute.popoutId);
        return true;
    } catch (error) {
        announceOperation(`This popout is no longer valid: ${describeOperationError(error)}.`);
        return false;
    }
}

async function createActivePanePopout() {
    if (popoutRoute) return;
    if (!await documentRuntimeFactory.flushPane(activePaneId)) {
        announceOperation("Could not pop out this pane because its pending save failed.");
        return;
    }
    const poppedPaneId = activePaneId;
    const popoutId = `popout-${crypto.randomUUID()}`;
    const dimensions = resolveWindowDimensions(
        window.outerWidth,
        window.outerHeight,
        window.innerWidth,
        window.innerHeight,
    );
    if (!dimensions) {
        announceOperation("Could not pop out this pane because the current window dimensions are unavailable.");
        return;
    }
    try {
        const snapshot = await WindowService.CreatePopout(
            poppedPaneId,
            popoutId,
            window.screenX,
            window.screenY,
            dimensions.width,
            dimensions.height,
        );
        await workspaceController.adoptBackendSnapshot(snapshot);
        await openActiveWorkspaceTab(snapshot);
        announceOperation(`Opened pane “${poppedPaneId}” in a new window.`);
    } catch (error) {
        announceOperation(`Could not pop out this pane: ${describeHumanOperationError(error, "the new window could not be opened")}.`);
    }
}

async function rejoinCurrentPopout() {
    if (!popoutRoute) return;
    try {
        await WindowService.RejoinPopout(popoutRoute.paneId, popoutRoute.popoutId);
    } catch (error) {
        announceOperation(`Could not rejoin this pane: ${describeOperationError(error)}.`);
    }
}

async function refreshWorkspaceFromBackend() {
    try {
        await workspaceRefreshCoordinator.run({
            fetch: () => StateService.GetWorkspaceState(),
            adopt: (snapshot) => workspaceController.adoptBackendSnapshot(snapshot),
            restore: (snapshot) => restoreWorkspaceLeafTabs(snapshot),
            open: (snapshot) => openActiveWorkspaceTab(snapshot),
        });
    } catch (error) {
        announceOperation(`Could not refresh the workspace: ${describeOperationError(error)}.`, refreshWorkspaceFromBackend);
    }
}

let workspaceMenuSignature = "";
let workspaceRenameTarget = "";

function syncWorkspaceApplicationMenu(snapshot: WorkspaceStateSnapshot) {
    const signature = `${snapshot.activeNamedWorkspace ?? ""}\0${namesFromWorkspaceSnapshot(snapshot).join("\0")}`;
    if (signature === workspaceMenuSignature) return;
    workspaceMenuSignature = signature;
    void WindowService.RefreshWorkspaceMenu();
}

function selectedNamedWorkspaceName(snapshot: WorkspaceStateSnapshot | null): string {
    const name = snapshot?.activeNamedWorkspace ?? "";
    return snapshot && isExactWorkspaceName(name) && namesFromWorkspaceSnapshot(snapshot).includes(name) ? name : "";
}

function paletteCommands(): CommandDescriptor[] {
    return mergeNamedWorkspacePaletteCommands(
        commandSnapshot,
        workspaceSnapshot ? namesFromWorkspaceSnapshot(workspaceSnapshot) : [],
    );
}

async function runNamedWorkspaceAction(action: NamedWorkspaceAction): Promise<void> {
    if (popoutRoute) {
        announceOperation("Named workspace commands are available in the main window.");
        return;
    }
    if (action.type === "save-as") {
        showWorkspaceSaveAsDialog();
        return;
    }
    if (action.type === "manage") {
        showWorkspaceManageDialog();
        return;
    }
    if (action.type === "save-current") {
        const name = selectedNamedWorkspaceName(workspaceSnapshot);
        if (!name) {
            announceOperation("Open or save a named workspace before using Save Current Workspace.");
            return;
        }
        await saveNamedWorkspaceByName(name);
        return;
    }
    await restoreNamedWorkspaceByName(action.name);
}

async function saveNamedWorkspaceByName(name: string): Promise<void> {
    if (!isExactWorkspaceName(name)) {
        announceOperation("Workspace names cannot be blank or include leading or trailing whitespace.");
        return;
    }
    try {
        await workspaceController.saveNamedWorkspace(name);
        announceOperation(`Saved workspace “${name}” (tabs, splits, layout, and popouts).`);
        renderWorkspaceManageList();
    } catch (error) {
        announceOperation(`Could not save workspace: ${describeOperationError(error)}.`);
    }
}

async function restoreNamedWorkspaceByName(name: string): Promise<void> {
    if (!isExactWorkspaceName(name)) {
        announceOperation("Open the exact saved workspace name to restore it.");
        return;
    }
    try {
        const snapshot = await workspaceController.restoreNamedWorkspace(name);
        if (snapshot) {
            await restoreWorkspaceLeafTabs(snapshot);
            await openActiveWorkspaceTab(snapshot);
            announceOperation(`Restored workspace “${name}”.`);
            hideWorkspaceManageDialog();
        }
    } catch (error) {
        announceOperation(`Could not restore workspace: ${describeOperationError(error)}.`);
    }
}

function showWorkspaceSaveAsDialog() {
    const overlay = document.getElementById("workspace-save-as-overlay") as HTMLElement;
    const input = document.getElementById("workspace-save-as-input") as HTMLInputElement;
    overlay.style.display = "flex";
    input.value = selectedNamedWorkspaceName(workspaceSnapshot);
    input.focus();
    input.select();
}

function hideWorkspaceSaveAsDialog() {
    const overlay = document.getElementById("workspace-save-as-overlay") as HTMLElement;
    overlay.style.display = "none";
}

async function submitWorkspaceSaveAs() {
    const input = document.getElementById("workspace-save-as-input") as HTMLInputElement;
    const name = input.value;
    hideWorkspaceSaveAsDialog();
    await saveNamedWorkspaceByName(name);
}

function showWorkspaceManageDialog() {
    const overlay = document.getElementById("workspace-manage-overlay") as HTMLElement;
    overlay.style.display = "flex";
    hideWorkspaceRenameRow();
    renderWorkspaceManageList();
}

function hideWorkspaceManageDialog() {
    const overlay = document.getElementById("workspace-manage-overlay") as HTMLElement;
    overlay.style.display = "none";
    hideWorkspaceRenameRow();
}

function hideWorkspaceRenameRow() {
    workspaceRenameTarget = "";
    const row = document.getElementById("workspace-rename-row") as HTMLElement;
    row.hidden = true;
}

function renderWorkspaceManageList() {
    const list = document.getElementById("workspace-manage-list") as HTMLElement;
    const empty = document.getElementById("workspace-manage-empty") as HTMLElement;
    const names = workspaceSnapshot ? namesFromWorkspaceSnapshot(workspaceSnapshot) : [];
    const active = selectedNamedWorkspaceName(workspaceSnapshot);
    list.replaceChildren();
    empty.hidden = names.length > 0;
    for (const name of names) {
        const item = document.createElement("li");
        item.className = "workspace-manage-item";
        item.dataset.active = String(name === active);
        const label = document.createElement("span");
        label.className = "workspace-manage-item-name";
        label.textContent = name;
        const open = document.createElement("button");
        open.type = "button";
        open.className = "secondary-btn";
        open.textContent = "Open";
        open.setAttribute("aria-label", `Open workspace ${name}`);
        open.addEventListener("click", () => void runNamedWorkspaceAction({ type: "open", name }));
        const rename = document.createElement("button");
        rename.type = "button";
        rename.className = "secondary-btn";
        rename.textContent = "Rename";
        rename.setAttribute("aria-label", `Rename workspace ${name}`);
        rename.addEventListener("click", () => showWorkspaceRenameRow(name));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger-btn";
        remove.textContent = "Delete";
        remove.setAttribute("aria-label", `Delete workspace ${name}`);
        remove.addEventListener("click", () => void deleteNamedWorkspaceByName(name));
        item.append(label, open, rename, remove);
        list.append(item);
    }
}

function showWorkspaceRenameRow(name: string) {
    workspaceRenameTarget = name;
    const row = document.getElementById("workspace-rename-row") as HTMLElement;
    const target = document.getElementById("workspace-rename-target") as HTMLElement;
    const input = document.getElementById("workspace-rename-input") as HTMLInputElement;
    row.hidden = false;
    target.textContent = name;
    input.value = name;
    input.focus();
    input.select();
}

async function submitWorkspaceRename() {
    const from = workspaceRenameTarget;
    const input = document.getElementById("workspace-rename-input") as HTMLInputElement;
    const to = input.value;
    if (!isExactWorkspaceName(from) || !isExactWorkspaceName(to)) {
        announceOperation("Workspace names cannot be blank or include leading or trailing whitespace.");
        return;
    }
    try {
        await workspaceController.renameNamedWorkspace(from, to);
        hideWorkspaceRenameRow();
        renderWorkspaceManageList();
        announceOperation(`Renamed workspace “${from}” to “${to}”. Current session tabs and splits are unchanged.`);
    } catch (error) {
        announceOperation(`Could not rename workspace: ${describeOperationError(error)}.`);
    }
}

async function deleteNamedWorkspaceByName(name: string) {
    if (!isExactWorkspaceName(name)) {
        announceOperation("Choose an exact saved workspace name to delete.");
        return;
    }
    try {
        await workspaceController.deleteNamedWorkspace(name);
        if (workspaceRenameTarget === name) hideWorkspaceRenameRow();
        renderWorkspaceManageList();
        announceOperation(`Deleted named workspace “${name}”. Current session tabs, splits, and last layout are unchanged.`);
    } catch (error) {
        announceOperation(`Could not delete workspace: ${describeOperationError(error)}.`);
    }
}

const miniPlayer = document.getElementById("mini-player") as HTMLElement;
const miniPlayerTitle = document.getElementById("mini-player-title")!;
const miniAudioPlayer = document.getElementById("mini-audio-player") as HTMLAudioElement;
const miniPlayerClose = document.getElementById("mini-player-close") as HTMLButtonElement;
const miniPlayerPlayPause = document.getElementById("mini-player-playpause") as HTMLButtonElement;
const miniPlayerCurrent = document.getElementById("mini-player-current") as HTMLElement;
const miniPlayerDuration = document.getElementById("mini-player-duration") as HTMLElement;
const miniPlayerSeek = document.getElementById("mini-player-seek") as HTMLInputElement;
const speedBtn = document.getElementById("speed-btn") as HTMLButtonElement;
const speedMenu = document.getElementById("speed-menu") as HTMLElement;
const audioLoopBtn = document.getElementById("audio-loop-btn") as HTMLButtonElement;
const transcribeBtn = document.getElementById("transcribe-btn") as HTMLButtonElement;
let currentPlaybackSpeed = loadStoredSpeed(window.localStorage);
let noteSearchQuery = "";
let noteSearchMatches: HTMLElement[] = [];
let noteSearchIndex = -1;
let activeOutlineIndex = -1;
let rightSidebarLayout: RightSidebarLayout = loadRightSidebarLayout();

// New viewer elements
const imageViewer = document.getElementById("image-viewer")!;
const imagePreview = document.getElementById("image-preview") as HTMLImageElement;
const imageTitle = document.getElementById("image-title")!;
const pdfViewer = document.getElementById("pdf-viewer")!;
const pdfContainerA = document.getElementById("pdf-container-a")!;
const pdfContainerB = document.getElementById("pdf-container-b")!;
let pdfActiveBuffer: 'a' | 'b' = 'a';
const pdfTitle = document.getElementById("pdf-title")!;
const pdfPageInfo = document.getElementById("pdf-page-info")!;
const pdfZoomInfo = document.getElementById("pdf-zoom-info")!;
const htmlEditorContainer = document.getElementById("html-editor-container")!;
const htmlEditor = document.getElementById("html-editor") as HTMLTextAreaElement;
const htmlPreview = document.getElementById("html-preview") as HTMLIFrameElement;
const htmlEditorTitle = document.getElementById("html-editor-title")!;
const workspaceHost = document.getElementById("workspace-host") as HTMLElement;
const workspacePaneTabs = document.getElementById("workspace-pane-tabs") as HTMLElement;
const popoutPaneButton = document.getElementById("popout-pane-btn") as HTMLButtonElement;
const rejoinPopoutButton = document.getElementById("rejoin-popout-btn") as HTMLButtonElement;

// Fullscreen overlay elements
const imageFullscreenOverlay = document.getElementById("image-fullscreen-overlay")!;
const imageFsPreview = document.getElementById("image-fs-preview") as HTMLImageElement;
const imageFsTitle = document.getElementById("image-fs-title")!;
const pdfFullscreenOverlay = document.getElementById("pdf-fullscreen-overlay")!;
const pdfFsContainer = document.getElementById("pdf-fs-container")!;
const pdfFsTitle = document.getElementById("pdf-fs-title")!;
const pdfFsPageInfo = document.getElementById("pdf-fs-page-info")!;
const pdfFsZoomInfo = document.getElementById("pdf-fs-zoom-info")!;

// PDF State
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
let pdfCurrentPage = 1;
let pdfTotalPages = 0;
let pdfScale = 1.0;
let pdfRendering = false;
let pdfPendingPage: number | null = null;
let pdfViewMode: 'single' | 'continuous' = 'continuous'; // Default to continuous scroll
let pdfCanvases: HTMLCanvasElement[] = [];
let pdfIsFullscreen = false;
let currentPdfPath: string | null = null;
type RichPdfSession = {
    paneId: string;
    path: string;
    generation: number;
    document: pdfjsLib.PDFDocumentProxy;
    currentPage: number;
    totalPages: number;
    scale: number;
    viewMode: "single" | "continuous";
    activeBuffer: "a" | "b";
    canvases: HTMLCanvasElement[];
};
const richPdfSessions = new Map<string, RichPdfSession>();
let richPdfFullscreen: { surface: RichSurface; session: RichPdfSession } | null = null;
const PDF_FIT_WIDTH_PADDING = 40;
const PDF_FIT_MIN_CONTAINER_WIDTH = 100;
const PDF_FIT_MIN_SCALE = 0.5;
const PDF_FIT_MAX_SCALE = 2.0;
const PDF_ZOOM_IN_FACTOR = 1.25;
const PDF_ZOOM_OUT_FACTOR = 0.8;
const PDF_MIN_SCALE = 0.25;
const PDF_MAX_SCALE = 5.0;
const PDF_SCROLL_PAGE_OFFSET = 16;
let commandSnapshot: CommandDescriptor[] = [];
const MIN_SIDEBAR_WIDTH = 150;
const MAX_SIDEBAR_WIDTH = 500;
let editorSettings: EditorSettings | null = null;
type ExplorerRuntimeState = ExplorerSessionState & { leftSidebarWidth: number; rightSidebarWidth: number };
let explorerSessionState = new ExplorerSessionState({ leftSidebarWidth: 0, rightSidebarWidth: 0 }) as ExplorerRuntimeState;
let applyingExplorerExpansion = false;
let expandedPathsSaveQueued = false;
let commandPaletteIndex = 0;
let commandPalettePreviousFocus: HTMLElement | null = null;

async function refreshCommandSnapshot() {
    commandSnapshot = await ConfigService.GetCommandDescriptors() as CommandDescriptor[];
    renderCommandPalette();
    renderCommandSettings();
    const toolbarTargets: Record<string, string> = {
        "open-settings": "settings-btn",
        "new-note": "new-note-btn",
        "toggle-graph-view": "graph-btn",
        "search-vault": "vault-search-btn",
    };
    for (const command of commandSnapshot) {
        const target = document.getElementById(toolbarTargets[command.id]);
        if (target) target.title = `${command.title} (${formatHotkeyForPlatform(command.hotkey, isMac)})`;
    }
}

function renderCommandSettings() {
    const list = document.getElementById("hotkey-settings-list"); if (!list) return;
    list.replaceChildren();
    for (const command of commandSnapshot) {
        const row = document.createElement("label"); row.className = "hotkey-settings-row"; row.setAttribute("role", "listitem");
        const title = document.createElement("span"); title.className = "hotkey-settings-title"; title.textContent = command.title;
        const input = document.createElement("input"); input.value = command.hotkey; input.setAttribute("aria-label", `${command.title} shortcut`);
        input.addEventListener("change", async () => { try { await ConfigService.SetHotkey(command.id, input.value); await refreshCommandSnapshot(); settingsStatus.textContent = "Shortcut saved."; } catch (err) { settingsStatus.textContent = `Shortcut conflict: ${describeOperationError(err)}`; input.value = command.hotkey; } });
        const clear = document.createElement("button"); clear.type = "button"; clear.textContent = "Reset";
        clear.addEventListener("click", async () => { try { await ConfigService.ClearHotkey(command.id); await refreshCommandSnapshot(); } catch (err) { settingsStatus.textContent = `Shortcut conflict: ${describeOperationError(err)}`; } });
        row.append(title, input, clear); list.append(row);
    }
    const help = document.getElementById("command-shortcuts-help");
    if (help) {
        help.replaceChildren();
        const title = document.createElement("h3"); title.textContent = "Commands"; help.append(title);
        for (const command of commandSnapshot) { const row = document.createElement("div"); row.className = "shortcut-row"; row.textContent = `${formatHotkeyForPlatform(command.hotkey, isMac)} — ${command.title}`; help.append(row); }
    }
}

function applyEditorSettings(settings: EditorSettings) {
    editorSettings = settings;
    for (const target of [editor, htmlEditor]) Object.assign(target.style, editorSettingsStyle(settings));
    for (const surface of paneSurfaces.values()) applyRichSurfaceEditorSettings(surface, settings);
    document.documentElement.dataset.lineNumbers = String(settings.lineNumbers);
    syncLineNumberGutters();
}

function applyRichSurfaceEditorSettings(surface: RichSurface, settings: EditorSettings) {
    for (const target of [surface.editor, surface.htmlEditor]) {
        Object.assign(target.style, editorSettingsStyle(settings));
    }
}

function syncLineNumberGutters() {
    const targets: Array<readonly [HTMLTextAreaElement, HTMLElement]> = [];
    for (const [textarea, gutterID] of [[editor, "editor-line-numbers"], [htmlEditor, "html-editor-line-numbers"]] as const) {
        const gutter = document.getElementById(gutterID);
        if (textarea.isConnected && gutter) targets.push([textarea, gutter]);
    }
    for (const surface of paneSurfaces.values()) {
        if (surface.editor.isConnected && surface.editorLineGutter.isConnected) targets.push([surface.editor, surface.editorLineGutter]);
        if (surface.htmlEditor.isConnected && surface.htmlEditorLineGutter.isConnected) targets.push([surface.htmlEditor, surface.htmlEditorLineGutter]);
    }
    for (const [textarea, gutter] of targets) {
        const style = getComputedStyle(textarea);
        const mirror = document.createElement("div");
        Object.assign(mirror.style, { position: "absolute", visibility: "hidden", whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap, font: style.font, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, padding: style.padding, width: `${textarea.clientWidth}px` });
        document.body.append(mirror);
        const lines = textarea.value.split("\n");
        const spans = lines.map((line) => { const span = document.createElement("span"); span.style.display = "block"; span.textContent = line || "\u200b"; mirror.append(span); return span; });
        gutter.replaceChildren(...spans.map((span, index) => { const row = document.createElement("div"); row.textContent = String(index + 1); row.style.position = "absolute"; row.style.top = `${span.offsetTop - textarea.scrollTop}px`; return row; }));
        gutter.style.font = style.font;
        gutter.style.lineHeight = style.lineHeight;
        mirror.remove();
    }
}

function renderCommandPalette() {
    const input = document.getElementById("command-palette-input") as HTMLInputElement | null;
    const list = document.getElementById("command-palette-results");
    if (!list) return;
    list.textContent = "";
    const commands = filterCommands(paletteCommands(), input?.value || "");
    commandPaletteIndex = Math.min(commandPaletteIndex, Math.max(0, commands.length - 1));
    input?.setAttribute("aria-activedescendant", commands[commandPaletteIndex] ? `command-palette-option-${commandPaletteIndex}` : "");
    for (const [index, command] of commands.entries()) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "command-palette-option";
        item.id = `command-palette-option-${index}`;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(index === commandPaletteIndex));
        item.textContent = command.hotkey
            ? `${command.title} (${formatHotkeyForPlatform(command.hotkey, isMac)})`
            : command.title;
        item.addEventListener("click", () => void activatePaletteCommand(command.id));
        list.appendChild(item);
    }
    list.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
}

function showCommandPalette() {
    const overlay = document.getElementById("command-palette-overlay")!;
    if (overlay.style.display === "none") commandPalettePreviousFocus = document.activeElement as HTMLElement | null;
    overlay.style.display = "flex";
    const input = document.getElementById("command-palette-input") as HTMLInputElement;
    input.value = ""; commandPaletteIndex = 0; renderCommandPalette(); input.focus();
}

function hideCommandPalette(restoreFocus = true) {
    document.getElementById("command-palette-overlay")!.style.display = "none";
    if (restoreFocus) commandPalettePreviousFocus?.focus();
    commandPalettePreviousFocus = null;
}

async function activatePaletteCommand(id: string) {
    hideCommandPalette(false);
    await executeCommand(id);
}

async function executeCommand(id: string) {
    const named = parseNamedWorkspaceCommand(id);
    if (named) return void runNamedWorkspaceAction(named);
    const known = commandSnapshot.some((command) => command.id === id);
    if (!known) { announceOperation("Unknown command. Refresh commands and try again.", async () => { await refreshCommandSnapshot(); }); return; }
    if (id === "command-palette") return showCommandPalette();
    if (id === "new-note") return showNewNoteForm();
    if (id === "quick-switcher") return showQuickSwitcher();
    if (id === "find-in-note") return openNoteSearch();
    if (id === "search-vault") return showVaultSearch();
    if (id === "save-current-file") return void saveActiveDocumentNow();
    if (id === "toggle-graph-view") return void toggleGraphView();
    if (id === "toggle-source-editor") return toggleSourceEditor();
    if (id === "split-pane-right") return void splitActiveWorkspacePane("horizontal");
    if (id === "split-pane-down") return void splitActiveWorkspacePane("vertical");
    if (id === "close-active-tab") return void closeActiveWorkspaceTab();
    if (id === "close-active-pane") return void closeActiveWorkspacePane();
    if (id === "open-settings") return void openSettings();
    if (id === "show-shortcuts-help") return toggleShortcutsHelp();
    if (id === "toggle-file-tree-focus") return fileTreeFocused ? (blurFileTree(), editor.focus()) : (editor.blur(), focusFileTree());
    if (id === "close-overlays") return closeTopOverlay();
    if (id === "undo-edit") return void applyDocumentHistory("undo");
    if (id === "redo-edit") return void applyDocumentHistory("redo");
    announceOperation("This command is not available in this screen.", async () => { await refreshCommandSnapshot(); });
}

function closeTopOverlay() {
    const palette = document.getElementById("command-palette-overlay") as HTMLElement;
    if (palette.style.display !== "none") return hideCommandPalette();
    if (quickSwitcherOverlay.style.display !== "none") return hideQuickSwitcher();
    if (vaultSearchOverlay.style.display !== "none") return hideVaultSearch();
    if (recentlyDeletedOverlay.style.display !== "none") return hideRecentlyDeleted();
    if (recoverySnapshotsOverlay.style.display !== "none") return hideRecoverySnapshots();
    const rich = activeRichSurface();
    if (rich && !rich.noteSearch.hidden) return closeNoteSearch();
    if (!noteSearch.hidden) return closeNoteSearch();
    if (document.getElementById("shortcuts-overlay")?.classList.contains("visible")) return hideShortcutsHelp();
    if (document.getElementById("settings-overlay")?.style.display !== "none") return hideSettings();
    if (document.getElementById("workspace-save-as-overlay")?.style.display !== "none") return hideWorkspaceSaveAsDialog();
    if (document.getElementById("workspace-manage-overlay")?.style.display !== "none") return hideWorkspaceManageDialog();
    if (document.getElementById("delete-confirm-overlay")?.style.display !== "none") return hideDeleteConfirmDialog();
    if (pdfIsFullscreen) return closePdfFullscreen();
    if (imageFullscreenOverlay.style.display !== "none") return closeImageFullscreen();
    if (document.getElementById("mermaid-fullscreen")?.style.display !== "none") return closeMermaidFullscreen();
    if (document.getElementById("broken-link-overlay")?.style.display !== "none") return hideBrokenLinkDialog();
    const moveOverlay = document.getElementById("move-to-folder-overlay") as HTMLElement;
    if (moveOverlay.style.display !== "none") { moveOverlay.style.display = "none"; return; }
    if (document.getElementById("vault-setup-overlay")?.style.display !== "none") return hideVaultSetupDialog();
    if (showGraph) return void hideGraphView();
    hideContextMenu();
}

// Initialize
async function init() {
    try {
        await StateService.Load();
        popoutRoute = getPopoutRoute();
        if (popoutRoute) {
            await WindowService.ValidatePopoutRoute(popoutRoute.paneId, popoutRoute.popoutId);
        } else {
            await reconcileStartupPopouts();
        }
        applyPopoutToolbarMode();
        mountLegacyRichSurface();
        await refreshCommandSnapshot();
        const config = await ConfigService.GetConfig();
        const explorer = await ConfigService.GetFileExplorerConfig();
        const explorerSession = await StateService.GetExplorerSessionState();
        const configuredSidebarWidth = await ConfigService.GetSidebarWidth();
        const leftWidth = (explorerSession.leftSidebarWidth ?? 0) > 0 ? explorerSession.leftSidebarWidth! : configuredSidebarWidth;
        const rightWidth = (explorerSession.rightSidebarWidth ?? 0) > 0 ? explorerSession.rightSidebarWidth! : configuredSidebarWidth;
        explorerSessionState = { ...explorerSession, leftSidebarWidth: leftWidth, rightSidebarWidth: rightWidth } as ExplorerRuntimeState;
        document.getElementById("sidebar")!.style.width = `${leftWidth}px`;
        document.documentElement.style.setProperty("--backlinks-width", `${rightWidth}px`);
        appThemeFromConfig = normalizeThemeValue(config?.UI?.Theme || "");
        fileTreeAutoReveal = explorer.AutoReveal;
        fileTreeSort = resolveFileTreeSort(explorer.SortField, explorer.SortDirection);
        if (config?.Vault?.Path) {
            let workspace = await workspaceController.ensureWorkspace(activePaneId);
            workspace = await workspaceController.removeUnavailableTabs(workspace, (path) => FileService.FileExists(path));
            await restoreWorkspaceLeafTabs(workspace);
            await openActiveWorkspaceTab(workspace);
            await loadFileTree();
            void requestRecoverySnapshot();
            restoreExpandedFolders(new Set(explorerSessionState.expandedPaths ?? []));
            const lastFile = await StateService.GetLastOpenedFile();
            if (lastFile) {
                const resolvedType = resolveFileType(lastFile.fileType, lastFile.path);
                try {
                    if (await FileService.FileExists(lastFile.path)) {
                        await openFile(lastFile.path, resolvedType);
                        lastSyncedOpenedFile = toStateKey(lastFile.path, resolvedType);
                    } else {
                        await StateService.ClearLastOpenedFile();
                        lastSyncedOpenedFile = "";
                    }
                } catch {
                    await StateService.ClearLastOpenedFile();
                    lastSyncedOpenedFile = "";
                }
            }

            startFileTreeWatcher();

            // Prefetch graph data in background (don't block init)
            prefetchGraphData().catch(console.error);
        } else {
            // Show vault setup dialog if no vault is configured
            showVaultSetupDialog();
        }
    } catch (err) {
        console.warn("Running in browser mode - backend services unavailable");
    }

    setupToolbarIcons();
    setupWindowFocusBreathing();
    setupEventListeners();
    document.documentElement.dataset.appReady = "true";
}

// ウィンドウが背面に回ったら、道具類が静かに沈む（macOSの作法）
function setupWindowFocusBreathing() {
    window.addEventListener("blur", () => {
        document.body.classList.add("window-inactive");
    });
    window.addEventListener("focus", () => {
        document.body.classList.remove("window-inactive");
    });
}

function setupToolbarIcons() {
    setButtonIcon(document.getElementById("settings-btn")!, "settings");
    setButtonIcon(document.getElementById("new-note-btn")!, "edit");
    setButtonIcon(document.getElementById("daily-note-btn")!, "calendar");
    setButtonIcon(document.getElementById("timeline-btn")!, "timeline");
    setButtonIcon(document.getElementById("graph-btn")!, "graph");
    setButtonIcon(document.getElementById("vault-search-btn")!, "search");
    setButtonIcon(document.getElementById("refresh-btn")!, "refresh");
    setButtonIcon(document.getElementById("popout-pane-btn")!, "external-link");
    setButtonIconWithLabel(document.getElementById("rejoin-popout-btn")!, "external-link", "Rejoin");
    setButtonIcon(document.getElementById("file-tree-sort-btn")!, "arrow-up-down");
    updateFolderToggleButton();
    setButtonIcon(document.getElementById("mini-player-close")!, "close");
    setButtonIcon(document.getElementById("vault-search-close")!, "close");
    setButtonIcon(document.getElementById("vault-search-submit")!, "search");
    setButtonIcon(document.getElementById("recently-deleted-close")!, "close");
    setButtonIcon(document.getElementById("recovery-snapshots-close")!, "close");

    const miniPlayerIcon = document.querySelector(".mini-player-icon") as HTMLElement | null;
    if (miniPlayerIcon) {
        miniPlayerIcon.innerHTML = renderIcon("music");
    }
    document.querySelectorAll<HTMLElement>(".sidebar-section-chevron, .details-chevron").forEach((element) => {
        element.innerHTML = renderIcon("chevron-down");
    });

    const searchClearBtn = document.getElementById("file-search-clear");
    if (searchClearBtn) {
        searchClearBtn.innerHTML = renderIcon("close");
    }

    document.querySelectorAll<HTMLElement>(".ctx-icon[data-icon]").forEach((el) => {
        el.innerHTML = renderIcon(el.dataset.icon as IconName);
    });

    const pdfViewModeBtn = document.getElementById("pdf-view-mode");
    const pdfFsViewModeBtn = document.getElementById("pdf-fs-view-mode");
    if (pdfViewModeBtn) pdfViewModeBtn.innerHTML = renderIcon("page-continuous");
    if (pdfFsViewModeBtn) pdfFsViewModeBtn.innerHTML = renderIcon("page-continuous");
}

function toStateKey(path: string, fileType: string): string {
    return `${path}::${fileType}`;
}

function startFileTreeWatcher() {
    if (fileTreeWatchTimerId !== null) {
        return;
    }

    fileTreeWatchTimerId = window.setInterval(async () => {
        if (isFileTreeWatchRunning) {
            return;
        }

        isFileTreeWatchRunning = true;
        try {
            const files = normalizeAndSortFileTree(await FileService.ListDirectoryTree(), fileTreeSort);
            const nextSignature = buildFileTreeSignature(files);

            if (fileTreeSignature === nextSignature) {
                await syncOpenFileWithVault();
                return;
            }

            applyFileTreeSnapshot(files);
            await LinkService.RebuildIndex();
            await syncOpenFileWithVault();
            await refreshOpenLinkPanels();

            if (showGraph) {
                await refreshGraphData();
            }
        } catch (err) {
            console.warn("Failed to watch file tree updates:", err);
            fileTreeStatus.textContent = `File tree updates stopped: ${describeOperationError(err)}. Retry loading files when ready.`;
            fileTreeRetry.hidden = false;
        } finally {
            isFileTreeWatchRunning = false;
        }
    }, FILE_TREE_WATCH_INTERVAL_MS);
}

function buildFileTreeSignature(files: FileInfo[]): string {
    const parts: string[] = [];

    const walk = (nodes: FileInfo[]) => {
        for (const file of nodes) {
            const modifiedAt = file.modifiedAt ? JSON.stringify(file.modifiedAt) : "";
            const createdAt = file.createdAt ? JSON.stringify(file.createdAt) : "";
            parts.push(`${file.path}|${file.isDir ? "1" : "0"}|${file.fileType || ""}|${modifiedAt}|${createdAt}`);

            if (file.children && file.children.length > 0) {
                walk(file.children);
            }
        }
    };

    walk(files);
    return parts.join("\n");
}

function parseFileTreeSort(field: unknown, direction: unknown): FileTreeSort | null {
    if ((field === "name" || field === "modified" || field === "created")
        && (direction === "ascending" || direction === "descending")) {
        return { field, direction };
    }
    return null;
}

function restoreActiveFileTreeSelection() {
    if (primaryDocumentRuntime.currentFilePath) {
        // Snapshot restore (watcher refresh etc.) must not undo user-collapsed folders.
        updateFileTreeSelection(primaryDocumentRuntime.currentFilePath, { reveal: false });
    }
}

type FileTreeSnapshotOptions = {
    revealActiveFile?: boolean;
};

function applyFileTreeSnapshot(files: FileInfo[], options: FileTreeSnapshotOptions = {}) {
    const expandedFolders = getExpandedFolderPaths();
    latestFileTree = files;
    fileTreeSignature = buildFileTreeSignature(files);
    renderFileTree(files);
    restoreExpandedFolders(expandedFolders);
    if (options.revealActiveFile !== false && fileTreeAutoReveal) {
        restoreActiveFileTreeSelection();
    }
    syncAudioPlaybackBadges();
    void loadLinkSuggestionNotes();
}

function getExpandedFolderPaths(): Set<string> {
    const paths = new Set<string>();
    fileTree.querySelectorAll(".file-item.folder.expanded").forEach((folder) => {
        const path = folder.getAttribute("data-path");
        if (path) {
            paths.add(path);
        }
    });
    return paths;
}

function restoreExpandedFolders(paths: Set<string>) {
    applyingExplorerExpansion = true;
    try {
        paths.forEach((path) => {
            const folder = findFileTreeElement(path, true);
            if (folder instanceof HTMLElement) setFolderExpanded(folder, true);
        });
    } finally {
        applyingExplorerExpansion = false;
    }
}

function queueExpandedPathsSave() {
    if (expandedPathsSaveQueued) return;
    expandedPathsSaveQueued = true;
    queueMicrotask(async () => {
        expandedPathsSaveQueued = false;
        const nextState = { ...explorerSessionState, expandedPaths: Array.from(getExpandedFolderPaths()) } as ExplorerRuntimeState;
        try {
            await StateService.SetExplorerSessionState(nextState);
            explorerSessionState = nextState;
        } catch (error) {
            announceOperation(`Could not save expanded folders: ${describeOperationError(error)}.`);
        }
    });
}

function findFileTreeElement(path: string, folderOnly = false): HTMLElement | null {
    return Array.from(fileTree.querySelectorAll<HTMLElement>(folderOnly ? ".file-item.folder" : ".file-item"))
        .find((element) => element.dataset.path === path) || null;
}

// Show vault setup dialog
function showVaultSetupDialog() {
    const overlay = document.getElementById("vault-setup-overlay")!;
    overlay.style.display = "flex";
}

// Hide vault setup dialog
function hideVaultSetupDialog() {
    const overlay = document.getElementById("vault-setup-overlay")!;
    overlay.style.display = "none";
}

// Handle vault folder selection
async function handleVaultFolderSelection() {
    try {
        const path = await ConfigService.SelectVaultFolder();
        if (path) {
            hideVaultSetupDialog();
            await StateService.Load();
            await workspaceController.ensureWorkspace(activePaneId);
            await loadFileTree();
            await LinkService.RebuildIndex();
            await refreshOpenLinkPanels();
            startFileTreeWatcher();
        }
    } catch (err) {
        console.error("Failed to select vault folder:", err);
        alert("Failed to select vault folder. Please try again.");
    }
}

// Prefetch graph data on app startup
async function prefetchGraphData() {
    console.log("[Graph] Prefetching graph data...");
    try {
        await LinkService.RebuildIndex();
        await refreshOpenLinkPanels();
        const graph = await GraphService.GetFullGraph();
        const stats = await GraphService.GetGraphStats();

        // Preserve existing positions if any
        const cached = loadCache(graphCacheStorage);
        const cachedData = cached?.data as CachedGraphData | undefined;
        const canReuseLayout = cachedData ? canReuseGraphLayout(cachedData.graphSignature, graph) : false;

        const cacheData: CachedGraphData = {
            graph,
            stats,
            graphSignature: createGraphStructureSignature(graph),
            nodePositions: canReuseLayout ? cachedData?.nodePositions : undefined,
            viewState: canReuseLayout ? cachedData?.viewState : undefined,
        };
        saveCache(graphCacheStorage, createCacheEntry(cacheData));
        console.log("[Graph] Prefetch complete - ready for instant display");
    } catch (err) {
        console.error("[Graph] Prefetch failed:", err);
    }
}

function editorContainerForPane(paneId: string): HTMLElement | null {
    if (paneId === legacySurfacePaneId) return editorContainer;
    return paneSurfaces.get(paneId)?.editorContainer || null;
}

function editorElementForPane(paneId: string): HTMLTextAreaElement | null {
    if (paneId === legacySurfacePaneId) return editor;
    return paneSurfaces.get(paneId)?.editor || null;
}

function isSourceEditorVisibleForPane(paneId: string): boolean {
    return !editorContainerForPane(paneId)?.classList.contains("source-hidden");
}

function syncPaneSourceToggleButton(paneId: string) {
    const button = paneActionClusters.get(paneId)?.querySelector<HTMLButtonElement>("[data-pane-action='source-toggle']");
    if (!button) return;
    const visible = isSourceEditorVisibleForPane(paneId);
    button.setAttribute("aria-pressed", visible ? "true" : "false");
    button.classList.toggle("active", visible);
}

// Source editor visibility (default: preview only, < > toggles the active pane source)
function toggleSourceEditorForPane(paneId: string) {
    const container = editorContainerForPane(paneId);
    if (!container) return;
    const hidden = container.classList.toggle("source-hidden");
    syncPaneSourceToggleButton(paneId);
    if (!hidden) {
        editorElementForPane(paneId)?.focus();
    }
}

function toggleSourceEditor() {
    toggleSourceEditorForPane(activePaneId);
}

async function splitWorkspacePaneFromUi(paneId: string, direction: "horizontal" | "vertical") {
    await activateWorkspacePaneFromUi(paneId);
    await splitActiveWorkspacePane(direction);
}

// Event Listeners
function setupEventListeners() {
    setupSettingsDialog();
    fileTreeRetry.addEventListener("click", () => void loadFileTree());
    document.getElementById("empty-vault-create")!.addEventListener("click", showNewNoteForm);
    operationRetry.addEventListener("click", () => {
        const retry = retryOperationAction;
        if (retry) void retry();
    });
    operationDismiss.addEventListener("click", () => clearOperationStatus());
    document.getElementById("settings-btn")!.addEventListener("click", openSettings);
    document.getElementById("new-note-btn")!.addEventListener("click", showNewNoteForm);
    document.getElementById("daily-note-btn")!.addEventListener("click", openTodayNote);
    document.getElementById("timeline-btn")!.addEventListener("click", toggleTimeline);
    document.getElementById("graph-btn")!.addEventListener("click", toggleGraphView);
    vaultSearchButton.addEventListener("click", showVaultSearch);
    document.getElementById("refresh-btn")!.addEventListener("click", refresh);
    popoutPaneButton.addEventListener("click", () => void createActivePanePopout());
    rejoinPopoutButton.addEventListener("click", () => void rejoinCurrentPopout());
    document.getElementById("graph-relayout")!.addEventListener("click", refreshGraphData);
    document.getElementById("graph-filters")!.addEventListener("submit", (event) => {
        event.preventDefault();
        void loadGraphData(true);
    });
    document.getElementById("graph-clear-filters")!.addEventListener("click", () => {
        const graphFilters = document.getElementById("graph-filters") as HTMLFormElement;
        graphFilters.reset();
        void loadGraphData();
    });
    document.getElementById("graph-open-note")!.addEventListener("click", () => void openSelectedGraphNote());
    document.getElementById("graph-local-node")!.addEventListener("click", () => void showSelectedNodeLocalGraph());
    document.getElementById("graph-copy-path")!.addEventListener("click", () => void copySelectedGraphPath());
    Events.On("obails:graph-magnify", handleGraphNativeMagnify);
    window.addEventListener("obails:graph-magnify", (event) => {
        handleGraphNativeMagnify({ data: (event as CustomEvent).detail });
    });
    document.getElementById("timeline-submit")!.addEventListener("click", submitTimeline);
    miniPlayerClose.addEventListener("click", stopAudioPlayback);
    audioLoopBtn.addEventListener("click", toggleAudioLoopMode);
    syncAudioLoopButton();

    // 倍速メニュー
    speedBtn.textContent = formatSpeedLabel(currentPlaybackSpeed);
    speedBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSpeedMenu();
    });
    speedMenu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => closeSpeedMenu());
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeSpeedMenu();
    });
    // メディア読み込み完了時に playbackRate がリセットされるので再適用する
    miniAudioPlayer.addEventListener("loadedmetadata", () => {
        if (miniAudioPlayer.playbackRate !== currentPlaybackSpeed) {
            miniAudioPlayer.playbackRate = currentPlaybackSpeed;
        }
        updatePlayerDuration();
        updatePlayerProgress();
    });

    // カスタム再生コントロール（再生/一時停止・シーク・時間表示）の配線
    setupCustomAudioControls();

    // 文字起こしボタン
    transcribeBtn.addEventListener("click", () => void handleTranscribeClick());

    setupWindowDoubleClickMaximise();

    // Timeline input: ⌘+Enter to submit
    timelineInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submitTimeline();
        }
    });

    // Vault setup dialog
    document.getElementById("vault-setup-btn")!.addEventListener("click", handleVaultFolderSelection);
    setupRecoveryDialogs();
    setupDeleteConfirmDialog();
    setupWorkspaceDialogs();

    // Graph overlay close button
    document.getElementById("graph-close")!.addEventListener("click", hideGraphView);

    // New note / rename form events
    document.getElementById("new-note-create")!.addEventListener("click", createNewNote);
    document.getElementById("new-note-cancel")!.addEventListener("click", hideNewNoteForm);
    filenameInputKeyboard = installFilenameInputKeyboard(
        document.getElementById("new-note-input") as HTMLInputElement,
        {
            submit: () => { void createNewNote(); },
            cancel: hideNewNoteForm,
        },
    );

    editor.addEventListener("input", recordActiveDocumentEdit);
    editor.addEventListener("input", syncLineNumberGutters);
    editor.addEventListener("scroll", syncLineNumberGutters);
    editor.addEventListener("input", scheduleEditorSave);
    editor.addEventListener("input", updatePreview);
    editor.addEventListener("input", updateWikiLinkSuggestions);
    editor.addEventListener("keydown", handleWikiLinkSuggestionKeydown);
    setupMarkdownAttachmentDropTarget();
    preview.addEventListener("scroll", updateActiveOutlineFromPreview);

    // HTML Editor events
    htmlEditor.addEventListener("input", recordActiveDocumentEdit);
    htmlEditor.addEventListener("input", syncLineNumberGutters);
    htmlEditor.addEventListener("scroll", syncLineNumberGutters);
    new ResizeObserver(syncLineNumberGutters).observe(editor);
    new ResizeObserver(syncLineNumberGutters).observe(htmlEditor);
    htmlEditor.addEventListener("input", scheduleHtmlSave);
    htmlEditor.addEventListener("input", updateHtmlPreview);
    saveStatusRetry.addEventListener("click", () => void retrySave());
    saveStatusReload.addEventListener("click", () => void reloadExternalVersion());
    saveStatusClose.addEventListener("click", () => void closeMissingDocument());
    htmlSaveStatusRetry.addEventListener("click", () => void retrySave());
    htmlSaveStatusReload.addEventListener("click", () => void reloadExternalVersion());
    htmlSaveStatusClose.addEventListener("click", () => void closeMissingDocument());
    htmlSaveStatusRetry.addEventListener("click", () => void retrySave());
    htmlSaveStatusReload.addEventListener("click", () => void reloadExternalVersion());

    // PDF Viewer controls
    document.getElementById("pdf-prev")!.addEventListener("click", pdfPrevPage);
    document.getElementById("pdf-next")!.addEventListener("click", pdfNextPage);
    document.getElementById("pdf-zoom-in")!.addEventListener("click", pdfZoomIn);
    document.getElementById("pdf-zoom-out")!.addEventListener("click", pdfZoomOut);
    document.getElementById("pdf-view-mode")!.addEventListener("click", togglePdfViewMode);
    document.getElementById("pdf-fullscreen")!.addEventListener("click", openPdfFullscreen);

    // PDF Fullscreen controls
    document.getElementById("pdf-fs-prev")!.addEventListener("click", pdfPrevPage);
    document.getElementById("pdf-fs-next")!.addEventListener("click", pdfNextPage);
    document.getElementById("pdf-fs-zoom-in")!.addEventListener("click", pdfZoomIn);
    document.getElementById("pdf-fs-zoom-out")!.addEventListener("click", pdfZoomOut);
    document.getElementById("pdf-fs-view-mode")!.addEventListener("click", togglePdfViewMode);
    document.getElementById("pdf-fs-close")!.addEventListener("click", closePdfFullscreen);

    // Image Viewer controls
    document.getElementById("image-fullscreen")!.addEventListener("click", openImageFullscreen);
    document.getElementById("image-fs-close")!.addEventListener("click", closeImageFullscreen);

    // Title editing (click to rename file)
    const editorTitle = document.getElementById("editor-title")!;
    const renameCurrentNote = () => {
        if (primaryDocumentRuntime.currentFilePath) {
            showRenameForm(primaryDocumentRuntime.currentFilePath, false);
        }
    };
    editorTitle.addEventListener("click", renameCurrentNote);
    editorTitle.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            renameCurrentNote();
        }
    });

    // Handle external links in preview - open in external browser
    setupPreviewInteractions();
    setupBrokenLinkDialog();
    preview.addEventListener("click", async (e) => {
        const target = e.target as HTMLElement;
        const link = target.closest("a");
        if (link) {
            const href = link.getAttribute("href");
            if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
                e.preventDefault();
                e.stopPropagation();
                await openExternalUrl(href);
            }
        }
    });

    // Keyboard shortcuts
    (document.getElementById("command-palette-input") as HTMLInputElement).addEventListener("input", renderCommandPalette);
    (document.getElementById("command-palette-input") as HTMLInputElement).addEventListener("keydown", (event) => {
        event.stopPropagation();
        const commands = filterCommands(paletteCommands(), (event.currentTarget as HTMLInputElement).value);
        if (event.key === "Escape") { event.preventDefault(); closeTopOverlay(); return; }
        if (event.key === "Enter" && commands[commandPaletteIndex]) { event.preventDefault(); void activatePaletteCommand(commands[commandPaletteIndex].id); return; }
        const next = event.key === "ArrowDown" ? commandPaletteIndex + 1 : event.key === "ArrowUp" ? commandPaletteIndex - 1 : event.key === "Home" ? 0 : event.key === "End" ? commands.length - 1 : null;
        if (next !== null && commands.length) { event.preventDefault(); commandPaletteIndex = Math.max(0, Math.min(next, commands.length - 1)); renderCommandPalette(); }
    });
    document.getElementById("command-palette-overlay")!.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) hideCommandPalette();
    });
    document.addEventListener("keydown", (e) => {
        if ((e.key === "?" || (e.key === "/" && e.shiftKey)) && !e.metaKey && !e.ctrlKey && !e.altKey && !suppressPrintableHotkeyInEditableTarget(e, e.target)) {
            e.preventDefault();
            toggleShortcutsHelp();
            return;
        }
        const command = !(suppressPrintableHotkeyInEditableTarget(e, e.target) || (e.key === "Escape" && fileTreeFocused))
            ? resolveHotkeyCommand(commandSnapshot, e, isMac, isNoteSearchContext(e.target))
            : undefined;
        if (command) {
            if ((command.id === "undo-edit" || command.id === "redo-edit") && !canApplyDocumentHistory()) return;
            e.preventDefault();
            void executeCommand(command.id);
            return;
        }
    });

    setupResizeHandles();
    setupRightSidebarLayoutControls();
    setupThemeMenu();
    setupContextMenu();
    setupMoveToFolderDialog();
    setupFileTreeDropTarget();
    setupFolderTreeControls();
    setupFileExplorerControls();
    setupFileSearch();
    setupQuickSwitcher();
    setupVaultSearch();
    setupNoteSearch();
    setupFileTreeKeyboardNavigation();
    setupShortcutsHelp();
    setupDialogAccessibility();
}

function setupDialogAccessibility() {
    const lastOutsideDialogFocus = { value: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    const restoreFocus = new WeakMap<HTMLElement, HTMLElement | null>();
    const dialogs: Array<[string, () => void]> = [
        ["image-fullscreen-overlay", closeImageFullscreen],
        ["pdf-fullscreen-overlay", closePdfFullscreen],
        ["mermaid-fullscreen", closeMermaidFullscreen],
        ["graph-overlay", () => void hideGraphView()],
        ["move-to-folder-overlay", () => { (document.getElementById("move-to-folder-overlay") as HTMLElement).style.display = "none"; }],
        ["broken-link-overlay", hideBrokenLinkDialog],
        ["quick-switcher-overlay", hideQuickSwitcher],
        ["command-palette-overlay", closeTopOverlay],
        ["vault-search-overlay", hideVaultSearch],
        ["vault-setup-overlay", hideVaultSetupDialog],
        ["delete-confirm-overlay", () => hideDeleteConfirmDialog()],
        ["workspace-save-as-overlay", hideWorkspaceSaveAsDialog],
        ["workspace-manage-overlay", hideWorkspaceManageDialog],
        ["settings-overlay", hideSettings],
        ["recently-deleted-overlay", hideRecentlyDeleted],
        ["recovery-snapshots-overlay", hideRecoverySnapshots],
        ["shortcuts-overlay", hideShortcutsHelp],
    ];

    const isVisible = (dialog: HTMLElement) => dialog.classList.contains("visible") || dialog.style.display === "flex" || dialog.style.display === "block";
    const focusable = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hidden);

    document.addEventListener("focusin", (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && !target.closest('[role="dialog"]')) {
            lastOutsideDialogFocus.value = target;
        }
    });

    for (const [id, close] of dialogs) {
        const dialog = document.getElementById(id) as HTMLElement;
        if (!dialog) continue;
        let wasVisible = isVisible(dialog);
        new MutationObserver(() => {
            const visible = isVisible(dialog);
            if (visible && !wasVisible) {
                restoreFocus.set(dialog, lastOutsideDialogFocus.value);
                if (!dialog.contains(document.activeElement)) {
                    focusable(dialog)[0]?.focus();
                }
            } else if (!visible && wasVisible) {
                const trigger = restoreFocus.get(dialog);
                if (trigger?.isConnected) trigger.focus();
            }
            wasVisible = visible;
        }).observe(dialog, { attributes: true, attributeFilter: ["class", "style"] });
        dialog.addEventListener("keydown", (event) => {
            if (!isVisible(dialog)) return;
            if (event.key === "Escape") {
                event.preventDefault();
                close();
                return;
            }
            if (event.key !== "Tab") return;
            const items = focusable(dialog);
            if (items.length === 0) return;
            const current = document.activeElement as HTMLElement;
            const index = items.indexOf(current);
            const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index === items.length - 1 ? 0 : index + 1);
            event.preventDefault();
            items[next]?.focus();
        });
    }
}

function setupShortcutsHelp() {
    const overlay = document.getElementById("shortcuts-overlay");
    const closeBtn = document.getElementById("shortcuts-close");

    // Close button click
    closeBtn?.addEventListener("click", hideShortcutsHelp);

    // Click on backdrop to close
    overlay?.addEventListener("click", (e) => {
        if (e.target === overlay) {
            hideShortcutsHelp();
        }
    });
}

// Setup file-tree as drop target for moving files to root and importing external files
function setupFileTreeDropTarget() {
    fileTree.addEventListener("dragover", (e) => {
        if (draggedFilePaths.length === 0 && !hasExternalFileDrop(e.dataTransfer)) {
            return;
        }
        e.preventDefault();
        if (e.target === fileTree || fileTree.contains(e.target as Node)) {
            fileTree.classList.add("drag-over-import");
        }
    });

    fileTree.addEventListener("dragleave", (e) => {
        if (!fileTree.contains(e.relatedTarget as Node)) {
            fileTree.classList.remove("drag-over-import", "drag-over-root");
        }
    });

    fileTree.addEventListener("drop", async (e) => {
        fileTree.classList.remove("drag-over-import", "drag-over-root");
        const folderItem = (e.target as HTMLElement).closest(".file-item.folder") as HTMLElement | null;
        if (folderItem) {
            return;
        }
        await handleFileTreeDrop(e, "");
    });
}

function setupFolderTreeControls() {
    document.getElementById("file-tree-fold-toggle-btn")!.addEventListener("click", () => {
        setAllFoldersExpanded(hasExpandedFolders() ? false : true);
    });
}

function setupFileExplorerControls() {
    const button = document.getElementById("file-tree-sort-btn") as HTMLButtonElement;
    const menu = document.getElementById("file-tree-sort-menu") as HTMLElement;
    const sortOptions: Array<{ sort: FileTreeSort; label: string }> = [
        { sort: { field: "name", direction: "ascending" }, label: "Name A-Z" },
        { sort: { field: "name", direction: "descending" }, label: "Name Z-A" },
        { sort: { field: "modified", direction: "descending" }, label: "Modified newest first" },
        { sort: { field: "modified", direction: "ascending" }, label: "Modified oldest first" },
        { sort: { field: "created", direction: "descending" }, label: "Created newest first" },
        { sort: { field: "created", direction: "ascending" }, label: "Created oldest first" },
    ];
    const currentLabel = () => sortOptions.find(({ sort }) => sort.field === fileTreeSort.field && sort.direction === fileTreeSort.direction)?.label || "Sort files";
    const closeMenu = () => {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
    };
    const renderMenu = () => {
        menu.replaceChildren();
        for (const option of sortOptions) {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "file-tree-sort-menu-item";
            item.setAttribute("role", "menuitemradio");
            const active = option.sort.field === fileTreeSort.field && option.sort.direction === fileTreeSort.direction;
            item.setAttribute("aria-checked", active ? "true" : "false");
            const check = document.createElement("span");
            check.className = "file-tree-sort-menu-check";
            check.innerHTML = active ? renderIcon("check") : "";
            const label = document.createElement("span");
            label.textContent = option.label;
            item.append(check, label);
            item.addEventListener("click", () => {
                void saveSort(option.sort);
            });
            menu.append(item);
        }
    };
    const saveSort = async (nextSort: FileTreeSort) => {
        if (!nextSort) return;
        try {
            await ConfigService.SetFileExplorerSort(nextSort.field, nextSort.direction);
            fileTreeSort = nextSort;
            button.title = currentLabel();
            button.setAttribute("aria-label", `Sort files: ${currentLabel()}`);
            renderMenu();
            closeMenu();
            await loadFileTree({ revealActiveFile: false });
        } catch (err) {
            console.error("Failed to save file explorer sort:", err);
            renderMenu();
        }
    };
    button.title = currentLabel();
    button.setAttribute("aria-label", `Sort files: ${currentLabel()}`);
    renderMenu();
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (menu.hidden) {
            renderMenu();
            menu.hidden = false;
            button.setAttribute("aria-expanded", "true");
        } else {
            closeMenu();
        }
    });
    menu.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
    });
}

function setFolderExpanded(folderItem: HTMLElement, expanded: boolean) {
    folderItem.classList.toggle("expanded", expanded);
    folderItem.setAttribute("aria-expanded", String(expanded));
    const iconSpan = folderItem.querySelector(".folder-icon");
    if (iconSpan) {
        iconSpan.innerHTML = renderIcon(expanded ? "folder-open" : "folder-closed");
    }

    const wrapper = folderItem.parentElement;
    const childrenEl = wrapper?.querySelector(":scope > .folder-children") as HTMLElement | null;
    if (childrenEl) {
        childrenEl.style.display = expanded ? "block" : "none";
    }
    if (!applyingExplorerExpansion) queueExpandedPathsSave();
    updateFolderToggleButton();
}

function hasExpandedFolders(): boolean {
    return fileTree.querySelector(".file-item.folder.expanded") !== null;
}

function updateFolderToggleButton() {
    const button = document.getElementById("file-tree-fold-toggle-btn") as HTMLButtonElement | null;
    if (!button) return;
    const expanded = hasExpandedFolders();
    const label = expanded ? "Collapse all folders" : "Expand all folders";
    button.title = label;
    button.setAttribute("aria-label", label);
    setButtonIcon(button, expanded ? "chevrons-down-up" : "chevrons-up-down");
}

function setAllFoldersExpanded(expanded: boolean) {
    fileTree.querySelectorAll(".file-item.folder").forEach((folder) => {
        setFolderExpanded(folder as HTMLElement, expanded);
    });
    updateFolderToggleButton();
}

async function handleFileTreeDrop(e: DragEvent, targetFolder: string) {
    if (draggedFilePaths.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        await movePathsToFolder(draggedFilePaths, targetFolder);
        return;
    }

    const externalPaths = extractExternalDropPaths(e.dataTransfer);
    if (externalPaths.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        await importExternalFiles(externalPaths, targetFolder);
        return;
    }

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        await importDroppedFileList(files, targetFolder);
    }
}

async function importExternalFiles(sourcePaths: string[], targetFolder: string) {
    const importedPaths: string[] = [];
    const collisions: string[] = [];

    for (const sourcePath of sourcePaths) {
        try {
            if (await FileService.IsExternalDirectory(sourcePath)) {
                const outcomes = await FileService.ImportExternalFolder(sourcePath, targetFolder);
                outcomes.forEach((outcome) => {
                    if (outcome.status === "imported" && !outcome.isDir) importedPaths.push(outcome.destinationPath);
                    if (outcome.status === "collision") collisions.push(outcome.destinationPath);
                });
            } else {
                const relativePath = await FileService.ImportExternalFile(sourcePath, targetFolder);
                importedPaths.push(relativePath);
            }
        } catch (err) {
            console.error("Failed to import external file:", err);
            announceOperation(`Could not import a dropped file: ${describeOperationError(err)}. Drop it again to retry.`);
        }
    }

    await finishExternalImport(importedPaths);
    if (collisions.length > 0) {
        announceOperation(`Imported without overwriting existing vault paths. Collisions: ${collisions.join(", ")}`);
    }
}

async function importDroppedFileList(files: FileList, targetFolder: string) {
    const importedPaths: string[] = [];

    for (const file of Array.from(files)) {
        const filePath = (file as File & { path?: string }).path;
        if (filePath) {
            try {
                const relativePath = await FileService.ImportExternalFile(filePath, targetFolder);
                importedPaths.push(relativePath);
            } catch (err) {
                console.error("Failed to import dropped file:", err);
                announceOperation(`Could not import a dropped file: ${describeOperationError(err)}. Drop it again to retry.`);
            }
            continue;
        }

        try {
            const relativePath = targetFolder ? `${targetFolder}/${file.name}` : file.name;
            const content = await file.text();
            await FileService.CreateFile(relativePath, content);
            importedPaths.push(relativePath);
        } catch (err) {
            console.error("Failed to import dropped file content:", err);
            announceOperation(`Could not import a dropped file: ${describeOperationError(err)}. Drop it again to retry.`);
        }
    }

    await finishExternalImport(importedPaths);
}

async function finishExternalImport(importedPaths: string[]) {
    if (importedPaths.length === 0) {
        return;
    }

    await loadFileTree({ revealActiveFile: false });
    const lastImported = importedPaths[importedPaths.length - 1];
    updateFileTreeSelection(lastImported, { reveal: false });

    const markdownPath = lastImportedMarkdownPath(importedPaths, (path) => getFileTypeFromPath(path) === "markdown");
    if (markdownPath) {
        await openNote(markdownPath);
    }
    announceOperation(`Imported ${importedPaths.length} file${importedPaths.length === 1 ? "" : "s"}.`);
}

function isCurrentMarkdownAttachmentTarget(notePath: string, document: EditableDocument | null = primaryDocumentRuntime.activeEditableDocument): document is EditableDocument {
    return Boolean(document
        && document.kind === "markdown"
        && document.snapshot.path === notePath
        && primaryDocumentRuntime.currentFilePath === notePath);
}

async function attachExternalFilesToCurrentNote(sourcePaths: string[], notePath: string) {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (sourcePaths.length === 0 || !isCurrentMarkdownAttachmentTarget(notePath, document)) {
        announceOperation("Could not attach dropped files because the target Markdown note is no longer open.");
        return;
    }

    const embeds: string[] = [];
    for (const sourcePath of sourcePaths) {
        if (!isCurrentMarkdownAttachmentTarget(notePath, document)) {
            announceOperation("Could not finish attaching dropped files because the target Markdown note changed.");
            return;
        }
        try {
            const result = await FileService.ImportAttachment(sourcePath, notePath);
            embeds.push(result.embed);
        } catch (err) {
            console.error("Failed to import attachment:", err);
            announceOperation(`Could not attach ${sourcePath}: ${describeOperationError(err)}.`);
        }
    }
    if (embeds.length === 0 || !isCurrentMarkdownAttachmentTarget(notePath, document)) {
        return;
    }
    try {
        const insertion = insertAttachmentEmbeds(editor.value, editor.selectionStart, editor.selectionEnd, embeds);
        editor.value = insertion.content;
        editor.selectionStart = insertion.selectionStart;
        editor.selectionEnd = insertion.selectionEnd;
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        announceOperation(`Attached ${embeds.length} file${embeds.length === 1 ? "" : "s"}.`);
    } catch (err) {
        announceOperation(`Could not insert attachment embeds: ${describeOperationError(err)}.`);
    }
}

function setupMarkdownAttachmentDropTarget() {
    editor.addEventListener("dragover", (event) => {
        if (event.dataTransfer?.files.length) {
            event.preventDefault();
        }
    });
    editor.addEventListener("drop", (event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length || !isBrowserFileDropWithoutPaths(event.dataTransfer ?? null)) {
            return;
        }
        event.preventDefault();
        announceOperation("Could not attach browser files without native source paths.");
    });
}

// File Search
function setupFileSearch() {
    if (!fileSearchInput) {
        console.error("[FileSearch] fileSearchInput element not found!");
        return;
    }
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;

    // When search input is focused, disable file tree keyboard mode
    fileSearchInput.addEventListener("focus", () => {
        // Clear file tree keyboard navigation state
        if (fileTreeFocused) {
            blurFileTree();
        }
    });

    // Incremental search on input
    fileSearchInput.addEventListener("input", () => {
        const query = fileSearchInput.value.trim().toLowerCase();

        // Show/hide clear button
        fileSearchClear.style.display = query ? "block" : "none";

        // Reset search selection when query changes
        resetSearchSelection();

        // Debounce search for performance
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        searchTimeout = setTimeout(() => {
            filterFileTree(query);
        }, 100);
    });

    // Clear search
    fileSearchClear.addEventListener("click", () => {
        fileSearchInput.value = "";
        fileSearchClear.style.display = "none";
        filterFileTree("");
        resetSearchSelection();
        fileSearchInput.focus();
    });

    // Keyboard navigation in search
    fileSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (fileSearchInput.value) {
                fileSearchInput.value = "";
                fileSearchClear.style.display = "none";
                filterFileTree("");
                resetSearchSelection();
            } else {
                fileSearchInput.blur();
                resetSearchSelection();
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            moveSearchSelection(1);
            return;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            moveSearchSelection(-1);
            return;
        }

        // Enter: Open selected file
        if (e.key === "Enter") {
            e.preventDefault();
            openSearchSelectedFile();
            return;
        }
    });
}

// Reset search selection
function resetSearchSelection() {
    const previousSelected = fileTree.querySelector(".search-selected");
    if (previousSelected) {
        previousSelected.classList.remove("search-selected");
    }
    searchSelectionIndex = -1;
}

// Move search selection up or down
function moveSearchSelection(direction: number) {
    // Include both files and folders - treat file tree as a flat list
    const visibleItems = getVisibleFileItems();
    if (visibleItems.length === 0) return;

    // Clear previous search selection
    const previousSearchSelected = fileTree.querySelector(".search-selected");
    if (previousSearchSelected) {
        previousSearchSelected.classList.remove("search-selected");
    }

    // Also clear any keyboard selection to prevent double highlights
    const previousKeyboardSelected = fileTree.querySelector(".keyboard-selected");
    if (previousKeyboardSelected) {
        previousKeyboardSelected.classList.remove("keyboard-selected");
    }

    // Calculate new index
    if (searchSelectionIndex === -1) {
        // First selection
        searchSelectionIndex = direction > 0 ? 0 : visibleItems.length - 1;
    } else {
        searchSelectionIndex += direction;
        // Wrap around
        if (searchSelectionIndex < 0) {
            searchSelectionIndex = visibleItems.length - 1;
        } else if (searchSelectionIndex >= visibleItems.length) {
            searchSelectionIndex = 0;
        }
    }

    // Apply selection
    const selectedItem = visibleItems[searchSelectionIndex];
    if (selectedItem) {
        selectedItem.classList.add("search-selected");
        selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
}

// Open the search-selected file
async function openSearchSelectedFile() {
    const selectedItem = fileTree.querySelector(".search-selected") as HTMLElement | null;
    let pathToOpen: string | null = null;

    if (selectedItem) {
        // Toggle folder if selected item is a folder
        if (selectedItem.classList.contains("folder")) {
            selectedItem.click();
            return;
        }
        pathToOpen = selectedItem.getAttribute("data-path");
    } else {
        // If no selection, open the first visible file (skip folders)
        const visibleItems = getVisibleFileItems().filter(item => !item.classList.contains("folder"));
        if (visibleItems.length > 0) {
            pathToOpen = visibleItems[0].getAttribute("data-path");
        }
    }

    if (pathToOpen) {
        const fileType = getFileTypeFromPath(pathToOpen);
        fileSearchInput.blur();
        resetSearchSelection();
        await openFile(pathToOpen, fileType);
        // Focus editor and reset cursor position (only for markdown files)
        if (fileType === "markdown") {
            editor.focus();
            editor.selectionStart = 0;
            editor.selectionEnd = 0;
            editor.scrollTop = 0;
        }
    }
}

// Filter file tree based on search query
function filterFileTree(query: string) {
    const allFileItems = fileTree.querySelectorAll(".file-item");
    const allFolderWrappers = fileTree.querySelectorAll(".file-wrapper");

    if (!query) {
        allFileItems.forEach(item => {
            item.classList.remove("search-hidden", "search-match");
        });
        allFolderWrappers.forEach(wrapper => {
            wrapper.classList.remove("search-hidden");
        });
        const expansion = nextSearchExpansionState("", { snapshot: searchExpansionSnapshot }, new Set());
        if (expansion.restoreSnapshot) {
            setAllFoldersExpanded(false);
            restoreExpandedFolders(expansion.restoreSnapshot);
        }
        searchExpansionSnapshot = expansion.state.snapshot;
        return;
    }

    const expansion = nextSearchExpansionState(query, { snapshot: searchExpansionSnapshot }, getExpandedFolderPaths());
    searchExpansionSnapshot = expansion.state.snapshot;

    // Track which folders have matching children
    const foldersWithMatches = new Set<Element>();

    // First pass: mark matching files and collect parent folders
    allFileItems.forEach(item => {
        const isMatch = matchesVaultRelativePath(item.getAttribute("data-path") || "", query);

        if (isMatch) {
            item.classList.add("search-match");
            item.classList.remove("search-hidden");

            // Mark all parent folders as having matches
            let parent = item.parentElement;
            while (parent && parent !== fileTree) {
                if (parent.classList.contains("file-wrapper") || parent.classList.contains("folder-children")) {
                    foldersWithMatches.add(parent);
                }
                parent = parent.parentElement;
            }
        } else {
            item.classList.remove("search-match");
            item.classList.add("search-hidden");
        }
    });

    // Second pass: show/hide folder wrappers
    allFolderWrappers.forEach(wrapper => {
        const hasMatchingDescendants = foldersWithMatches.has(wrapper) ||
            wrapper.querySelector(".search-match") !== null;

        if (hasMatchingDescendants) {
            wrapper.classList.remove("search-hidden");
            // Expand folder children to show matches
            const children = wrapper.querySelector(".folder-children");
            if (children) {
                (children as HTMLElement).style.display = "block";
            }
        } else {
            wrapper.classList.add("search-hidden");
        }
    });

    // Show folder items that lead to matches
    allFileItems.forEach(item => {
        if (item.classList.contains("folder")) {
            const wrapper = item.closest(".file-wrapper");
            if (wrapper && foldersWithMatches.has(wrapper)) {
                item.classList.remove("search-hidden");
            }
        }
    });
}

function setupVaultSearch() {
    vaultSearchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void runVaultSearch();
    });
    vaultSearchInput.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            moveVaultSearchSelection(1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveVaultSearchSelection(-1);
        } else if (event.key === "Enter" && vaultSearchResults.length > 0) {
            event.preventDefault();
            const selected = vaultSearchResults[vaultSearchSelectedIndex];
            if (selected) {
                void openVaultSearchResult(selected);
            }
        } else if (event.key === "Escape") {
            event.preventDefault();
            hideVaultSearch();
        }
    });
    document.getElementById("vault-search-close")!.addEventListener("click", hideVaultSearch);
    vaultSearchOverlay.addEventListener("click", (event) => {
        if (event.target === vaultSearchOverlay) {
            hideVaultSearch();
        }
    });
}

function showVaultSearch() {
    if (vaultSearchOverlay.style.display !== "none") {
        vaultSearchInput.focus();
        return;
    }
    vaultSearchRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    vaultSearchOverlay.style.display = "flex";
    vaultSearchButton.setAttribute("aria-expanded", "true");
    vaultSearchInput.focus();
}

function hideVaultSearch() {
    vaultSearchGeneration += 1;
    vaultSearchOverlay.style.display = "none";
    vaultSearchButton.setAttribute("aria-expanded", "false");
    vaultSearchInput.removeAttribute("aria-activedescendant");
    const restoreFocus = vaultSearchRestoreFocus;
    vaultSearchRestoreFocus = null;
    if (restoreFocus?.isConnected) {
        restoreFocus.focus();
    }
}

async function runVaultSearch() {
    const query = vaultSearchInput.value.trim();
    vaultSearchError.hidden = true;
    vaultSearchError.textContent = "";
    vaultSearchStatus.textContent = "Searching the vault…";
    vaultSearchResults = [];
    vaultSearchSelectedIndex = -1;
    vaultSearchResultsList.replaceChildren();

    if (!query) {
        vaultSearchError.hidden = false;
        vaultSearchError.textContent = "Enter a search expression before searching the vault.";
        vaultSearchStatus.textContent = "Search has not been sent.";
        return;
    }

    const searchGeneration = ++vaultSearchGeneration;

    try {
        const options = createVaultSearchOptions({
            query,
            matchCase: vaultSearchMatchCase.checked,
            sort: vaultSearchSort.value as VaultSearchSort,
            contextRunes: vaultSearchContext.value,
        });
        const results = await SearchService.Search(options) as VaultSearchResult[];
        if (searchGeneration !== vaultSearchGeneration || vaultSearchOverlay.style.display === "none") {
            return;
        }
        vaultSearchResults = results;
        vaultSearchSelectedIndex = vaultSearchResults.length > 0 ? 0 : -1;
        vaultSearchStatus.textContent = vaultSearchResults.length === 1
            ? "1 matching file."
            : `${vaultSearchResults.length} matching files.`;
        renderVaultSearchResults();
    } catch (error) {
        if (searchGeneration !== vaultSearchGeneration || vaultSearchOverlay.style.display === "none") {
            return;
        }
        vaultSearchError.hidden = false;
        vaultSearchError.textContent = error instanceof Error ? error.message : String(error);
        vaultSearchStatus.textContent = "Correct the expression or context length, then search again.";
    }
}

function renderVaultSearchResults() {
    vaultSearchResultsList.replaceChildren();
    if (vaultSearchResults.length === 0) {
        const empty = document.createElement("li");
        empty.className = "vault-search-empty";
        empty.textContent = "No matching files.";
        vaultSearchResultsList.appendChild(empty);
        vaultSearchInput.removeAttribute("aria-activedescendant");
        return;
    }

    vaultSearchResults.forEach((result, index) => {
        const item = document.createElement("li");
        item.id = `vault-search-result-${index}`;
        item.className = "vault-search-result";
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(index === vaultSearchSelectedIndex));
        item.tabIndex = -1;

        const title = document.createElement("span");
        title.className = "vault-search-result-title";
        title.textContent = result.title;
        item.appendChild(title);

        const path = document.createElement("span");
        path.className = "vault-search-result-path";
        path.textContent = result.line && result.line > 0
            ? `${result.path} · line ${result.line} · ${result.matchCount} match${result.matchCount === 1 ? "" : "es"}`
            : `${result.path} · ${result.matchCount} match${result.matchCount === 1 ? "" : "es"}`;
        item.appendChild(path);

        if (result.context) {
            const context = document.createElement("span");
            context.className = "vault-search-result-context";
            context.textContent = result.context;
            item.appendChild(context);
        }

        item.addEventListener("click", () => void openVaultSearchResult(result));
        vaultSearchResultsList.appendChild(item);
    });
    updateVaultSearchSelection();
}

function moveVaultSearchSelection(direction: number) {
    if (vaultSearchResults.length === 0) {
        return;
    }
    vaultSearchSelectedIndex = (vaultSearchSelectedIndex + direction + vaultSearchResults.length) % vaultSearchResults.length;
    updateVaultSearchSelection();
}

function updateVaultSearchSelection() {
    vaultSearchResultsList.querySelectorAll<HTMLElement>("[role='option']").forEach((item, index) => {
        const selected = index === vaultSearchSelectedIndex;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-selected", String(selected));
        if (selected) {
            vaultSearchInput.setAttribute("aria-activedescendant", item.id);
            item.scrollIntoView({ block: "nearest" });
        }
    });
}

async function openVaultSearchResult(result: VaultSearchResult) {
    hideVaultSearch();
    await openFile(result.path, "markdown");
    if (result.line && result.line > 0) {
        jumpToLine(result.line - 1);
    }
}

function setupQuickSwitcher() {
    quickSwitcherInput.addEventListener("input", () => {
        renderQuickSwitcherResults();
    });
    quickSwitcherInput.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            moveQuickSwitcherSelection(1);
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            moveQuickSwitcherSelection(-1);
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) {
                const createResult = quickSwitcherResults.find((result) => result.kind === "create");
                if (createResult) {
                    void activateQuickSwitcherResult(createResult);
                }
                return;
            }
            const selectedResult = quickSwitcherResults[quickSwitcherSelectedIndex];
            if (selectedResult) {
                void activateQuickSwitcherResult(selectedResult);
            }
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            hideQuickSwitcher();
        }
    });
    quickSwitcherOverlay.addEventListener("click", (event) => {
        if (event.target === quickSwitcherOverlay) {
            hideQuickSwitcher();
        }
    });
}

function showQuickSwitcher() {
    if (quickSwitcherOverlay.style.display !== "none") {
        quickSwitcherInput.focus();
        return;
    }
    quickSwitcherRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    quickSwitcherOverlay.style.display = "flex";
    quickSwitcherInput.value = "";
    quickSwitcherNotes = [];
    quickSwitcherResults = [];
    quickSwitcherSelectedIndex = -1;
    renderQuickSwitcherResults();
    quickSwitcherInput.focus();
    void loadQuickSwitcherNotes();
}

function hideQuickSwitcher() {
    quickSwitcherLoadGeneration += 1;
    quickSwitcherOverlay.style.display = "none";
    quickSwitcherInput.removeAttribute("aria-activedescendant");
    const restoreFocus = quickSwitcherRestoreFocus;
    quickSwitcherRestoreFocus = null;
    if (restoreFocus?.isConnected) {
        restoreFocus.focus();
    }
}

async function loadQuickSwitcherNotes() {
    const loadGeneration = ++quickSwitcherLoadGeneration;
    const markdownFiles = flattenFileTree(latestFileTree).filter((file) => !file.isDir && getFileTypeFromPath(file.path) === "markdown");
    const notes = await Promise.all(markdownFiles.map(async (file) => {
        try {
            const note = await NoteService.GetNote(file.path);
            return {
                path: file.path,
                title: getDisplayName(file.path, "file"),
                aliases: getQuickSwitcherAliases(note?.frontmatter),
            };
        } catch (error) {
            console.warn("Failed to read quick switcher metadata:", error);
            return {
                path: file.path,
                title: getDisplayName(file.path, "file"),
                aliases: [],
            };
        }
    }));

    if (loadGeneration !== quickSwitcherLoadGeneration || quickSwitcherOverlay.style.display === "none") {
        return;
    }
    quickSwitcherNotes = notes;
    renderQuickSwitcherResults();
}

function flattenFileTree(files: FileInfo[]): FileInfo[] {
    const flattened: FileInfo[] = [];
    const visit = (nodes: FileInfo[]) => {
        for (const file of nodes) {
            flattened.push(file);
            if (file.children?.length) {
                visit(file.children);
            }
        }
    };
    visit(files);
    return flattened;
}

function getQuickSwitcherAliases(frontmatter: Record<string, unknown> | undefined): string[] {
    if (!frontmatter) {
        return [];
    }
    return [frontmatter.aliases, frontmatter.alias].flatMap((value) => {
        if (typeof value === "string") {
            return [value];
        }
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    });
}

async function loadLinkSuggestionNotes() {
    const loadGeneration = ++linkSuggestionLoadGeneration;
    const markdownFiles = flattenFileTree(latestFileTree).filter((file) => !file.isDir && getFileTypeFromPath(file.path) === "markdown");
    const notes = await Promise.all(markdownFiles.map(async (file) => {
        try {
            const note = await NoteService.GetNote(file.path);
            return {
                path: file.path,
                title: getDisplayName(file.path, "file"),
                aliases: getQuickSwitcherAliases(note?.frontmatter),
            };
        } catch (error) {
            console.warn("Failed to read link suggestion metadata:", error);
            return {
                path: file.path,
                title: getDisplayName(file.path, "file"),
                aliases: [],
            };
        }
    }));
    if (loadGeneration !== linkSuggestionLoadGeneration) {
        return;
    }
    linkSuggestionNotes = notes;
    updateWikiLinkSuggestions();
}

function updateWikiLinkSuggestions() {
    const query = getWikiLinkQueryAtCursor(editor.value, editor.selectionStart);
    if (!query || !primaryDocumentRuntime.activeEditableDocument || primaryDocumentRuntime.activeEditableDocument.kind !== "markdown") {
        hideWikiLinkSuggestions();
        return;
    }
    linkSuggestionResults = getWikiLinkSuggestions(linkSuggestionNotes, query.query);
    linkSuggestionSelectedIndex = linkSuggestionResults.length ? 0 : -1;
    linkSuggestions.replaceChildren();
    linkSuggestions.hidden = false;

    if (linkSuggestionResults.length === 0) {
        const empty = document.createElement("div");
        empty.className = "link-suggestion-detail";
        empty.textContent = "No matching note or alias";
        linkSuggestions.appendChild(empty);
        return;
    }

    linkSuggestionResults.forEach((suggestion, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.id = `link-suggestion-${index}`;
        option.className = "link-suggestion";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === linkSuggestionSelectedIndex));

        const title = document.createElement("span");
        title.textContent = suggestion.matchedTerm;
        const detail = document.createElement("span");
        detail.className = "link-suggestion-detail";
        detail.textContent = suggestion.resolvesAlias
            ? `${suggestion.matchedTerm} resolves to ${suggestion.note.path}`
            : suggestion.note.path;
        option.append(title, detail);
        option.addEventListener("click", () => insertWikiLinkSuggestion(suggestion));
        linkSuggestions.appendChild(option);
    });
    updateWikiLinkSuggestionSelection();
}

function handleWikiLinkSuggestionKeydown(event: KeyboardEvent) {
    if (linkSuggestions.hidden) {
        return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (linkSuggestionResults.length) {
            const movement = event.key === "ArrowDown" ? 1 : -1;
            linkSuggestionSelectedIndex = (linkSuggestionSelectedIndex + movement + linkSuggestionResults.length) % linkSuggestionResults.length;
            updateWikiLinkSuggestionSelection();
        }
        return;
    }
    if (event.key === "Enter" && linkSuggestionSelectedIndex >= 0) {
        event.preventDefault();
        insertWikiLinkSuggestion(linkSuggestionResults[linkSuggestionSelectedIndex]);
        return;
    }
    if (event.key === "Escape") {
        event.preventDefault();
        hideWikiLinkSuggestions();
    }
}

function updateWikiLinkSuggestionSelection() {
    linkSuggestions.querySelectorAll<HTMLElement>("[role='option']").forEach((option, index) => {
        const selected = index === linkSuggestionSelectedIndex;
        option.classList.toggle("selected", selected);
        option.setAttribute("aria-selected", String(selected));
        if (selected) {
            editor.setAttribute("aria-activedescendant", option.id);
        }
    });
}

function insertWikiLinkSuggestion(suggestion: WikiLinkSuggestion) {
    const query = getWikiLinkQueryAtCursor(editor.value, editor.selectionStart);
    if (!query) {
        hideWikiLinkSuggestions();
        return;
    }
    const before = editor.value.slice(0, query.start);
    const after = editor.value.slice(editor.selectionStart);
    const hasClosingDelimiter = after.startsWith("]]");
    editor.value = `${before}${suggestion.insertTarget}]]${hasClosingDelimiter ? after.slice(2) : after}`;
    const cursor = before.length + suggestion.insertTarget.length + 2;
    editor.setSelectionRange(cursor, cursor);
    hideWikiLinkSuggestions();
    editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function hideWikiLinkSuggestions() {
    linkSuggestions.hidden = true;
    linkSuggestions.replaceChildren();
    linkSuggestionResults = [];
    linkSuggestionSelectedIndex = -1;
    editor.removeAttribute("aria-activedescendant");
}

function renderQuickSwitcherResults() {
    quickSwitcherResults = getQuickSwitcherResults(
        quickSwitcherNotes,
        quickSwitcherInput.value,
        loadRecentQuickSwitcherPaths()
    );
    quickSwitcherSelectedIndex = quickSwitcherResults.length ? 0 : -1;
    quickSwitcherResultsList.replaceChildren();

    if (quickSwitcherResults.length === 0) {
        const empty = document.createElement("li");
        empty.className = "quick-switcher-empty";
        empty.textContent = "No recent notes";
        quickSwitcherResultsList.appendChild(empty);
        quickSwitcherInput.removeAttribute("aria-activedescendant");
        return;
    }

    quickSwitcherResults.forEach((result, index) => {
        const item = document.createElement("li");
        item.id = `quick-switcher-result-${index}`;
        item.className = "quick-switcher-result";
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(index === quickSwitcherSelectedIndex));
        item.tabIndex = -1;
        const title = document.createElement("span");
        title.className = "quick-switcher-result-title";
        title.textContent = result.kind === "note" ? result.note.title : `Create note \u201c${result.name}\u201d`;
        item.appendChild(title);

        const detail = document.createElement("span");
        detail.className = "quick-switcher-result-detail";
        detail.textContent = result.kind === "note"
            ? (result.matchedTerm === result.note.title ? result.note.path : `${result.note.path} \u00b7 ${result.matchedTerm}`)
            : "Shift+Enter creates this exact name";
        item.appendChild(detail);
        item.addEventListener("click", () => void activateQuickSwitcherResult(result));
        quickSwitcherResultsList.appendChild(item);
    });
    updateQuickSwitcherSelection();
}

function moveQuickSwitcherSelection(direction: number) {
    if (!quickSwitcherResults.length) {
        return;
    }
    quickSwitcherSelectedIndex = (quickSwitcherSelectedIndex + direction + quickSwitcherResults.length) % quickSwitcherResults.length;
    updateQuickSwitcherSelection();
}

function updateQuickSwitcherSelection() {
    quickSwitcherResultsList.querySelectorAll<HTMLElement>("[role='option']").forEach((item, index) => {
        const selected = index === quickSwitcherSelectedIndex;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-selected", String(selected));
        if (selected) {
            quickSwitcherInput.setAttribute("aria-activedescendant", item.id);
            item.scrollIntoView({ block: "nearest" });
        }
    });
}

async function activateQuickSwitcherResult(result: QuickSwitcherResult) {
    if (!await flushActiveDocumentBeforeSwitch()) {
        return;
    }

    try {
        if (result.kind === "create") {
            const path = buildChildPath("", result.name, "file");
            await FileService.CreateFile(path, "");
            await loadFileTree();
            await LinkService.RebuildIndex();
            hideQuickSwitcher();
            await openFile(path, "markdown");
        } else {
            hideQuickSwitcher();
            await openFile(result.note.path, "markdown");
        }
        editor.focus();
    } catch (error) {
        console.error("Quick switcher action failed:", error);
        alert(`Quick switcher action failed: ${error}`);
    }
}

function loadRecentQuickSwitcherPaths(): string[] {
    try {
        const stored = JSON.parse(window.localStorage.getItem(QUICK_SWITCHER_RECENT_STORAGE_KEY) || "[]");
        return Array.isArray(stored) ? stored.filter((path): path is string => typeof path === "string") : [];
    } catch {
        return [];
    }
}

function recordRecentQuickSwitcherPath(path: string) {
    try {
        const recentPaths = loadRecentQuickSwitcherPaths().filter((recentPath) => recentPath !== path);
        window.localStorage.setItem(QUICK_SWITCHER_RECENT_STORAGE_KEY, JSON.stringify([path, ...recentPaths]));
    } catch (error) {
        console.warn("Failed to persist recent quick switcher note:", error);
    }
}

// Keyboard Navigation for File Tree
function getVisibleFileItems(): HTMLElement[] {
    const items: HTMLElement[] = [];

    function collectVisibleItems(container: Element) {
        for (const wrapper of container.children) {
            if (!(wrapper instanceof HTMLElement)) continue;
            if (!wrapper.classList.contains("file-wrapper")) continue;
            if (wrapper.classList.contains("search-hidden")) continue;

            const fileItem = wrapper.querySelector(":scope > .file-item") as HTMLElement | null;
            if (!fileItem) continue;
            if (fileItem.classList.contains("search-hidden")) continue;

            items.push(fileItem);

            // If it's a folder with visible children, collect them
            // Check both "expanded" class (normal state) and visible folder-children (search filter state)
            if (fileItem.classList.contains("folder")) {
                const childrenContainer = wrapper.querySelector(":scope > .folder-children") as HTMLElement | null;
                if (childrenContainer) {
                    const isExpanded = fileItem.classList.contains("expanded");
                    const isVisible = childrenContainer.style.display !== "none" && childrenContainer.style.display !== "";
                    // Collect children if folder is expanded OR children are visible (search mode)
                    if (isExpanded || isVisible) {
                        collectVisibleItems(childrenContainer);
                    }
                }
            }
        }
    }

    collectVisibleItems(fileTree);
    return items;
}

function updateKeyboardSelection(newIndex: number, reveal = true) {
    const visibleItems = getVisibleFileItems();
    if (visibleItems.length === 0) return;

    // Remove previous keyboard selection
    document.querySelectorAll(".file-item.keyboard-selected").forEach(el => {
        el.classList.remove("keyboard-selected");
        (el as HTMLElement).tabIndex = -1;
    });

    // Clamp index
    keyboardSelectedIndex = Math.max(0, Math.min(newIndex, visibleItems.length - 1));

    // Apply keyboard selection
    const selectedItem = visibleItems[keyboardSelectedIndex];
    if (selectedItem) {
        selectedItem.classList.add("keyboard-selected");
        selectedItem.tabIndex = 0;
        selectedItem.focus();
        if (reveal) {
            selectedItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }
}

function clearKeyboardSelection() {
    document.querySelectorAll(".file-item.keyboard-selected").forEach(el => {
        el.classList.remove("keyboard-selected");
    });
    keyboardSelectedIndex = -1;
}

function focusFileTree() {
    fileTreeFocused = true;
    fileTree.classList.add("keyboard-focused");

    // If nothing is selected, select the first item or currently active file
    if (keyboardSelectedIndex === -1) {
        const visibleItems = getVisibleFileItems();
        if (visibleItems.length > 0) {
            // Try to select currently active file
            const activeItem = visibleItems.find(item => item.classList.contains("active"));
            if (activeItem) {
                keyboardSelectedIndex = visibleItems.indexOf(activeItem);
            } else {
                keyboardSelectedIndex = 0;
            }
            updateKeyboardSelection(keyboardSelectedIndex);
        }
    }
}

function blurFileTree() {
    fileTreeFocused = false;
    fileTree.classList.remove("keyboard-focused");
    clearKeyboardSelection();
}

function handleFileTreeKeydown(e: KeyboardEvent) {
    if (!fileTreeFocused) return;

    // Escape should work even with empty file tree
    if (e.key === "Escape") {
        e.preventDefault();
        blurFileTree();
        return;
    }

    const visibleItems = getVisibleFileItems();
    if (visibleItems.length === 0) return;

    const currentItem = visibleItems[keyboardSelectedIndex];

    switch (e.key) {
        case "j":
        case "ArrowDown":
            e.preventDefault();
            updateKeyboardSelection(keyboardSelectedIndex + 1);
            break;

        case "k":
        case "ArrowUp":
            e.preventDefault();
            updateKeyboardSelection(keyboardSelectedIndex - 1);
            break;

        case "l":
        case "ArrowRight":
            e.preventDefault();
            if (currentItem?.classList.contains("folder")) {
                // Open folder if closed
                if (!currentItem.classList.contains("expanded")) {
                    currentItem.click();
                } else if (e.key === "ArrowRight") {
                    const nextItem = visibleItems[keyboardSelectedIndex + 1];
                    if (nextItem) updateKeyboardSelection(keyboardSelectedIndex + 1);
                }
            }
            break;

        case "h":
        case "ArrowLeft":
            e.preventDefault();
            if (currentItem) {
                if (currentItem.classList.contains("folder") && currentItem.classList.contains("expanded")) {
                    currentItem.click();
                    break;
                }
                // Move to parent folder (don't close folders)
                const parentWrapper = currentItem.closest(".folder-children")?.closest(".file-wrapper");
                if (parentWrapper) {
                    const parentFolder = parentWrapper.querySelector(":scope > .file-item.folder") as HTMLElement | null;
                    if (parentFolder) {
                        const newIndex = visibleItems.indexOf(parentFolder);
                        if (newIndex !== -1) {
                            updateKeyboardSelection(newIndex);
                        }
                    }
                }
            }
            break;

        case "Enter":
            e.preventDefault();
            if (currentItem) {
                if (currentItem.classList.contains("folder")) {
                    // Toggle folder
                    currentItem.click();
                } else {
                    // Open file directly and focus editor
                    const filePath = currentItem.getAttribute("data-path");
                    if (filePath) {
                        const fileType = getFileTypeFromPath(filePath);
                        blurFileTree();
                        openFile(filePath, fileType).then(() => {
                            // Focus editor for markdown files
                            // Cursor position is already reset to 0 in openNote
                            if (fileType === "markdown") {
                                editor.focus();
                            }
                        });
                    }
                }
            }
            break;

        case "ContextMenu":
            e.preventDefault();
            showContextMenuForKeyboardItem(currentItem);
            break;

        // Escape is handled above before visibleItems check
    }
}

function setupFileTreeKeyboardNavigation() {
    document.addEventListener("keydown", (e) => {
        // Shift+Tab to toggle focus between file tree and editor
        if (e.key === "Tab" && e.shiftKey) {
            const activeEl = document.activeElement;

            // Don't interfere if we're in specific input elements
            if (activeEl && (
                activeEl.id === "file-search-input" ||
                activeEl.id === "timeline-input" ||
                activeEl.id === "new-note-input"
            )) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            if (fileTreeFocused) {
                blurFileTree();
                editor.focus();
            } else {
                editor.blur();
                focusFileTree();
            }
            return;
        }

        // Handle j/k/h/l/Enter/Escape when file tree is focused
        // Skip if any input element is focused (search mode, etc.)
        if (["j", "k", "h", "l", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "ContextMenu"].includes(e.key)
            || (e.shiftKey && e.key === "F10")) {
            if (fileTreeFocused && !isInputFocused()) {
                if (e.shiftKey && e.key === "F10") {
                    e.preventDefault();
                    showContextMenuForKeyboardItem(getVisibleFileItems()[keyboardSelectedIndex]);
                    return;
                }
                handleFileTreeKeydown(e);
            }
        }
    });

    // Click on file tree to focus it
    fileTree.addEventListener("click", (e) => {
        // Only focus if clicking directly on file tree (not on items)
        if (e.target === fileTree) {
            focusFileTree();
        }
    });

    // Make file tree focusable
    fileTree.setAttribute("tabindex", "-1");
}

// Helper to check if an input/textarea is focused
function isInputFocused(): boolean {
    const activeEl = document.activeElement;
    if (!activeEl) return false;
    const tagName = activeEl.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || (activeEl as HTMLElement).isContentEditable;
}

// Shortcuts Help Overlay
function toggleShortcutsHelp() {
    const overlay = document.getElementById("shortcuts-overlay");
    if (overlay?.classList.contains("visible")) {
        hideShortcutsHelp();
    } else {
        showShortcutsHelp();
    }
}

function showShortcutsHelp() {
    const overlay = document.getElementById("shortcuts-overlay");
    if (overlay) {
        // Update modifier key display based on platform
        const modKey = isMac ? "⌘" : "Ctrl";
        overlay.querySelectorAll(".mod-key").forEach(el => {
            el.textContent = modKey;
        });
        overlay.classList.add("visible");
    }
}

function hideShortcutsHelp() {
    const overlay = document.getElementById("shortcuts-overlay");
    if (overlay) {
        overlay.classList.remove("visible");
    }
}

// Settings
function populateSettingsThemes() {
    const select = document.getElementById("settings-theme") as HTMLSelectElement;
    select.replaceChildren();
    for (const groupName of new Set(THEME_OPTIONS.map((theme) => theme.group))) {
        const group = document.createElement("optgroup");
        group.label = groupName;
        for (const theme of THEME_OPTIONS.filter((option) => option.group === groupName)) {
            const option = document.createElement("option");
            option.value = theme.value;
            option.textContent = theme.label;
            group.append(option);
        }
        select.append(group);
    }
}

function populateAttachmentLocationOptions() {
    const select = document.getElementById("settings-attachment-location") as HTMLSelectElement;
    select.replaceChildren();
    for (const location of ATTACHMENT_LOCATION_OPTIONS) {
        const option = document.createElement("option");
        option.value = location.value;
        option.textContent = location.label;
        select.append(option);
    }
}

function syncAttachmentFolderVisibility() {
    const select = document.getElementById("settings-attachment-location") as HTMLSelectElement;
    const row = document.getElementById("settings-attachment-folder-row") as HTMLElement;
    row.hidden = !attachmentLocationNeedsFolder(select.value);
}

async function refreshAttachmentSettings() {
    const config = await ConfigService.GetAttachmentConfig();
    const select = document.getElementById("settings-attachment-location") as HTMLSelectElement;
    const folder = document.getElementById("settings-attachment-folder") as HTMLInputElement;
    select.value = config.location;
    folder.value = config.folder;
    syncAttachmentFolderVisibility();
}

async function refreshEditorSettings() {
    const editorConfig = await ConfigService.GetEditorConfig();
    const settings = { fontFamily: editorConfig.FontFamily, fontSize: editorConfig.FontSize, lineNumbers: editorConfig.LineNumbers, wordWrap: editorConfig.WordWrap };
    applyEditorSettings(settings);
    (document.getElementById("settings-font-family") as HTMLInputElement).value = settings.fontFamily;
    (document.getElementById("settings-font-size") as HTMLInputElement).value = String(settings.fontSize);
    (document.getElementById("settings-line-numbers") as HTMLInputElement).checked = settings.lineNumbers;
    (document.getElementById("settings-word-wrap") as HTMLInputElement).checked = settings.wordWrap;
}

async function openSettings() {
    const overlay = document.getElementById("settings-overlay")!;
    try {
        deleteMode = normalizeDeleteMode(await ConfigService.GetDeleteMode());
        syncDeleteModeControls();
        (document.getElementById("file-tree-auto-reveal") as HTMLInputElement).checked = fileTreeAutoReveal;
        await refreshEditorSettings();
        await refreshAttachmentSettings();
        (document.getElementById("settings-theme") as HTMLSelectElement).value = appThemeFromConfig || DEFAULT_THEME;
        (document.getElementById("settings-sidebar-width") as HTMLInputElement).value = String(await ConfigService.GetSidebarWidth());
        overlay.style.display = "flex";
        settingsStatus.textContent = "";
        settingsRetry.hidden = true;
        retrySettingsAction = null;
        (document.getElementById("settings-close") as HTMLButtonElement).focus();
    } catch (err) {
        console.error("Failed to open settings:", err);
        overlay.style.display = "flex";
        showSettingsFailure(`Could not load settings: ${describeOperationError(err)}.`, openSettings);
        settingsRetry.focus();
    }
}

function setupSettingsDialog() {
    const overlay = document.getElementById("settings-overlay")!;
    const closeButton = document.getElementById("settings-close")!;
    const openConfigButton = document.getElementById("settings-open-config")!;
    const recentlyDeletedButton = document.getElementById("recently-deleted-open")!;
    const recoverySnapshotsButton = document.getElementById("recovery-snapshots-open")!;
    const modeOptions = document.getElementById("delete-mode-options")!;
    const autoReveal = document.getElementById("file-tree-auto-reveal") as HTMLInputElement;
    populateSettingsThemes();
    populateAttachmentLocationOptions();
    const editorSetters: Array<[string, () => Promise<void>]> = [
        ["settings-font-family", () => ConfigService.SetEditorFontFamily((document.getElementById("settings-font-family") as HTMLInputElement).value)],
        ["settings-font-size", () => ConfigService.SetEditorFontSize(Number((document.getElementById("settings-font-size") as HTMLInputElement).value))],
        ["settings-line-numbers", () => ConfigService.SetEditorLineNumbers((document.getElementById("settings-line-numbers") as HTMLInputElement).checked)],
        ["settings-word-wrap", () => ConfigService.SetEditorWordWrap((document.getElementById("settings-word-wrap") as HTMLInputElement).checked)],
    ];
    for (const [id, setter] of editorSetters) {
        const save = async () => { await setter(); await refreshEditorSettings(); settingsStatus.textContent = "Editor setting saved."; };
        document.getElementById(id)!.addEventListener("change", () => void save().catch(async (err) => {
            await refreshEditorSettings();
            showSettingsFailure(`Could not save editor setting: ${describeOperationError(err)}.`, save);
        }));
    }
    document.getElementById("settings-theme")!.addEventListener("change", (event) => { void persistTheme((event.target as HTMLSelectElement).value); });
    document.getElementById("settings-sidebar-width")!.addEventListener("change", async (event) => {
        const width = Number((event.target as HTMLInputElement).value);
        await persistExplorerWidths({ ...explorerSessionState, leftSidebarWidth: width, rightSidebarWidth: width }, true);
    });
    const attachmentLocation = document.getElementById("settings-attachment-location") as HTMLSelectElement;
    const attachmentFolder = document.getElementById("settings-attachment-folder") as HTMLInputElement;
    const saveAttachmentSettings = async () => {
        await ConfigService.SetAttachmentConfig(new AttachmentConfig({
            location: attachmentLocation.value,
            folder: attachmentFolder.value,
        }));
        await refreshAttachmentSettings();
        settingsStatus.textContent = "Attachment destination saved.";
        settingsRetry.hidden = true;
    };
    attachmentLocation.addEventListener("change", () => {
        syncAttachmentFolderVisibility();
        void saveAttachmentSettings().catch((err) => {
            void refreshAttachmentSettings();
            showSettingsFailure(`Could not save attachment destination: ${describeOperationError(err)}.`, saveAttachmentSettings);
        });
    });
    attachmentFolder.addEventListener("change", () => void saveAttachmentSettings().catch((err) => {
        void refreshAttachmentSettings();
        showSettingsFailure(`Could not save attachment destination: ${describeOperationError(err)}.`, saveAttachmentSettings);
    }));

    closeButton.addEventListener("click", hideSettings);
    settingsRetry.addEventListener("click", () => {
        const retry = retrySettingsAction;
        if (retry) void retry();
    });
    openConfigButton.addEventListener("click", async () => {
        try {
            await ConfigService.OpenConfigFile();
        } catch (err) {
            console.error("Failed to open config file:", err);
            showSettingsFailure(`Could not open the config file: ${describeOperationError(err)}.`, async () => {
                await ConfigService.OpenConfigFile();
                settingsStatus.textContent = "Opened the config file.";
                settingsRetry.hidden = true;
            });
        }
    });
    recentlyDeletedButton.addEventListener("click", () => void showRecentlyDeleted());
    recoverySnapshotsButton.addEventListener("click", () => void showRecoverySnapshots());
    modeOptions.addEventListener("change", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.name === "delete-mode") {
            void setDeleteMode(normalizeDeleteMode(target.value));
        }
    });
    autoReveal.addEventListener("change", () => {
        void (async () => {
            const previous = fileTreeAutoReveal;
            fileTreeAutoReveal = autoReveal.checked;
            try {
                await ConfigService.SetFileExplorerAutoReveal(fileTreeAutoReveal);
            } catch (err) {
                console.error("Failed to save auto reveal setting:", err);
                fileTreeAutoReveal = previous;
                autoReveal.checked = previous;
                showSettingsFailure(`Could not save File Explorer settings: ${describeOperationError(err)}.`, async () => {
                    await ConfigService.SetFileExplorerAutoReveal(autoReveal.checked);
                    fileTreeAutoReveal = autoReveal.checked;
                    settingsStatus.textContent = "Saved File Explorer settings.";
                    settingsRetry.hidden = true;
                });
            }
        })();
    });
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            hideSettings();
        }
    });
}

function hideSettings() {
    document.getElementById("settings-overlay")!.style.display = "none";
}

async function openExternalUrl(href: string) {
    try {
        await FileService.OpenURL(href);
        announceOperation("");
    } catch (err) {
        console.error("Failed to open external link:", err);
        announceOperation(`Could not open this link: ${describeOperationError(err)}.`, () => openExternalUrl(href));
    }
}

function syncDeleteModeControls() {
    const selected = document.querySelector<HTMLInputElement>(`input[name="delete-mode"][value="${deleteMode}"]`);
    if (selected) {
        selected.checked = true;
    }
}

async function setDeleteMode(nextMode: DeleteMode) {
    if (nextMode === deleteMode) {
        return;
    }
    if (nextMode === "permanent" && !window.confirm("Permanently delete files and folders? This cannot be undone.")) {
        syncDeleteModeControls();
        return;
    }

    try {
        await ConfigService.SetDeleteMode(nextMode);
        deleteMode = nextMode;
    } catch (err) {
        console.error("Failed to save delete destination:", err);
        syncDeleteModeControls();
        showSettingsFailure(`Could not save the delete destination: ${describeOperationError(err)}.`, async () => {
            await ConfigService.SetDeleteMode(nextMode);
            deleteMode = nextMode;
            syncDeleteModeControls();
            settingsStatus.textContent = "Saved delete destination.";
            settingsRetry.hidden = true;
        });
    }
}

function setupRecoveryDialogs() {
    document.getElementById("recently-deleted-close")!.addEventListener("click", hideRecentlyDeleted);
    document.getElementById("recovery-snapshots-close")!.addEventListener("click", hideRecoverySnapshots);
    recoverySnapshotPath.addEventListener("input", () => {
        loadedRecoverySnapshotPath = "";
        recoverySnapshotContent.value = "";
        recoverySnapshotRestore.disabled = true;
    });
    recoverySnapshotRead.addEventListener("click", () => void readSelectedRecoverySnapshotFile());
    recoverySnapshotRestore.addEventListener("click", () => void restoreSelectedRecoverySnapshotFile());
    recoverySnapshotRetry.addEventListener("click", () => void retryRecoverySnapshot());
    recentlyDeletedOverlay.addEventListener("click", (event) => {
        if (event.target === recentlyDeletedOverlay) hideRecentlyDeleted();
    });
    recoverySnapshotsOverlay.addEventListener("click", (event) => {
        if (event.target === recoverySnapshotsOverlay) hideRecoverySnapshots();
    });
}

async function showRecentlyDeleted() {
    hideSettings();
    recentlyDeletedOverlay.style.display = "flex";
    recentlyDeletedStatus.textContent = "Loading recently deleted items…";
    recentlyDeletedList.replaceChildren();
    try {
        const items = await FileService.ListRecentlyDeleted() as RecentlyDeletedItem[];
        renderRecentlyDeleted(items);
    } catch (err) {
        console.error("Failed to load recently deleted items:", err);
        recentlyDeletedStatus.textContent = `Could not load recently deleted items: ${err instanceof Error ? err.message : String(err)}`;
    }
}

function hideRecentlyDeleted() {
    recentlyDeletedOverlay.style.display = "none";
    void openSettings();
}

function renderRecentlyDeleted(items: RecentlyDeletedItem[]) {
    recentlyDeletedList.replaceChildren();
    if (items.length === 0) {
        recentlyDeletedStatus.textContent = "No recoverable deleted files or folders are available.";
        return;
    }
    recentlyDeletedStatus.textContent = `${items.length} recoverable deleted item${items.length === 1 ? "" : "s"}.`;
    for (const item of items) {
        const listItem = document.createElement("li");
        listItem.className = "recovery-list-item";
        listItem.dataset.recoveryId = item.id;
        const details = document.createElement("div");
        const path = document.createElement("div");
        path.className = "recovery-list-path";
        path.textContent = item.path;
        const metadata = document.createElement("div");
        metadata.className = "recovery-list-detail";
        metadata.textContent = describeRecentlyDeletedItem(item);
        details.append(path, metadata);
        const restore = document.createElement("button");
        restore.type = "button";
        restore.className = "primary-btn";
        restore.textContent = "Restore";
        restore.addEventListener("click", () => void restoreRecentlyDeleted(item, restore));
        listItem.append(details, restore);
        recentlyDeletedList.appendChild(listItem);
    }
}

async function restoreRecentlyDeleted(item: RecentlyDeletedItem, button: HTMLButtonElement) {
    button.disabled = true;
    recentlyDeletedStatus.textContent = `Restoring “${item.path}”…`;
    try {
        await FileService.RestoreRecentlyDeleted(item.id);
        await loadFileTree();
        const items = await FileService.ListRecentlyDeleted() as RecentlyDeletedItem[];
        renderRecentlyDeleted(items);
        recentlyDeletedStatus.textContent = `Restored “${item.path}” without overwriting existing vault content.`;
    } catch (err) {
        console.error("Failed to restore recently deleted item:", err);
        recentlyDeletedStatus.textContent = describeRecoveryRestoreError(item.path, err);
        button.disabled = false;
    }
}

async function showRecoverySnapshots() {
    hideSettings();
    selectedRecoverySnapshot = null;
    loadedRecoverySnapshotPath = "";
    recoverySnapshotPath.value = "";
    recoverySnapshotContent.value = "";
    recoverySnapshotRead.disabled = true;
    recoverySnapshotRestore.disabled = true;
    recoverySnapshotsOverlay.style.display = "flex";
    recoverySnapshotRetry.hidden = !recoverySnapshotSaveError;
    recoverySnapshotsStatus.textContent = "Loading recovery snapshots…";
    recoverySnapshotsList.replaceChildren();
    try {
        const snapshots = await FileService.ListRecoverySnapshots() as RecoverySnapshot[];
        renderRecoverySnapshots(snapshots);
        if (recoverySnapshotSaveError) {
            recoverySnapshotsStatus.textContent = recoverySnapshotSaveError;
        }
    } catch (err) {
        console.error("Failed to load recovery snapshots:", err);
        recoverySnapshotsStatus.textContent = `Could not load recovery snapshots: ${err instanceof Error ? err.message : String(err)}`;
    }
}

async function requestRecoverySnapshot() {
    if (recoverySnapshotRequestInFlight) {
        return;
    }
    recoverySnapshotRequestInFlight = true;
    try {
        await FileService.SaveRecoverySnapshot();
        recoverySnapshotSaveError = null;
        if (recoverySnapshotsOverlay.style.display !== "none") {
            recoverySnapshotRetry.hidden = true;
        }
    } catch (err) {
        console.error("Failed to save recovery snapshot:", err);
        recoverySnapshotSaveError = `Automatic recovery snapshot failed: ${err instanceof Error ? err.message : String(err)}`;
        if (recoverySnapshotsOverlay.style.display !== "none") {
            recoverySnapshotsStatus.textContent = recoverySnapshotSaveError;
            recoverySnapshotRetry.hidden = false;
        }
    } finally {
        recoverySnapshotRequestInFlight = false;
    }
}

async function retryRecoverySnapshot() {
    recoverySnapshotRetry.disabled = true;
    recoverySnapshotsStatus.textContent = "Retrying recovery snapshot…";
    await requestRecoverySnapshot();
    recoverySnapshotRetry.disabled = false;
    if (recoverySnapshotSaveError) {
        recoverySnapshotsStatus.textContent = recoverySnapshotSaveError;
        recoverySnapshotRetry.hidden = false;
        return;
    }
    recoverySnapshotRetry.hidden = true;
    await showRecoverySnapshots();
}

function hideRecoverySnapshots() {
    recoverySnapshotsOverlay.style.display = "none";
    void openSettings();
}

function renderRecoverySnapshots(snapshots: RecoverySnapshot[]) {
    recoverySnapshotsList.replaceChildren();
    if (snapshots.length === 0) {
        recoverySnapshotsStatus.textContent = "No recovery snapshots are available yet.";
        return;
    }
    recoverySnapshotsStatus.textContent = `${snapshots.length} recovery snapshot${snapshots.length === 1 ? "" : "s"}. Select one, then enter a file path.`;
    for (const snapshot of snapshots) {
        const listItem = document.createElement("li");
        listItem.className = "recovery-list-item";
        const details = document.createElement("div");
        const id = document.createElement("div");
        id.className = "recovery-list-path";
        id.textContent = snapshot.id;
        const metadata = document.createElement("div");
        metadata.className = "recovery-list-detail";
        metadata.textContent = describeRecoverySnapshot(snapshot);
        details.append(id, metadata);
        const select = document.createElement("button");
        select.type = "button";
        select.className = "secondary-btn";
        select.textContent = "Select";
        select.addEventListener("click", () => selectRecoverySnapshot(snapshot));
        listItem.append(details, select);
        recoverySnapshotsList.appendChild(listItem);
    }
}

function selectRecoverySnapshot(snapshot: RecoverySnapshot) {
    selectedRecoverySnapshot = snapshot;
    loadedRecoverySnapshotPath = "";
    recoverySnapshotContent.value = "";
    recoverySnapshotRead.disabled = false;
    recoverySnapshotRestore.disabled = true;
    recoverySnapshotsStatus.textContent = `Selected snapshot ${snapshot.id}. Enter a vault-relative file path, then read its contents.`;
    Array.from(recoverySnapshotsList.children).forEach((entry) => {
        entry.classList.toggle("selected", entry.querySelector(".recovery-list-path")?.textContent === snapshot.id);
    });
    recoverySnapshotPath.focus();
}

function selectedRecoveryPath(): string | null {
    const path = recoverySnapshotPath.value.trim();
    if (!selectedRecoverySnapshot || !path) {
        recoverySnapshotsStatus.textContent = "Select a snapshot and enter an exact vault-relative file path.";
        return null;
    }
    return path;
}

async function readSelectedRecoverySnapshotFile() {
    const path = selectedRecoveryPath();
    if (!path || !selectedRecoverySnapshot) return;
    recoverySnapshotRead.disabled = true;
    recoverySnapshotRestore.disabled = true;
    recoverySnapshotsStatus.textContent = `Reading “${path}” from the selected snapshot…`;
    try {
        recoverySnapshotContent.value = await FileService.ReadRecoverySnapshotFile(selectedRecoverySnapshot.id, path);
        loadedRecoverySnapshotPath = path;
        recoverySnapshotRestore.disabled = false;
        recoverySnapshotsStatus.textContent = `Showing stored contents for “${path}”.`;
    } catch (err) {
        console.error("Failed to read recovery snapshot file:", err);
        recoverySnapshotContent.value = "";
        loadedRecoverySnapshotPath = "";
        recoverySnapshotsStatus.textContent = `Could not read “${path}”: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
        recoverySnapshotRead.disabled = false;
    }
}

async function restoreSelectedRecoverySnapshotFile() {
    const path = selectedRecoveryPath();
    if (!path || !selectedRecoverySnapshot) return;
    if (loadedRecoverySnapshotPath !== path) {
        recoverySnapshotsStatus.textContent = "Read the stored file contents before restoring this file.";
        return;
    }
    recoverySnapshotRestore.disabled = true;
    recoverySnapshotsStatus.textContent = `Restoring “${path}”…`;
    try {
        await FileService.RestoreRecoverySnapshotFile(selectedRecoverySnapshot.id, path);
        await loadFileTree();
        recoverySnapshotsStatus.textContent = `Restored “${path}” from the selected snapshot.`;
    } catch (err) {
        console.error("Failed to restore recovery snapshot file:", err);
        recoverySnapshotsStatus.textContent = describeRecoveryRestoreError(path, err);
        recoverySnapshotRestore.disabled = false;
    }
}

// New Note Creation
function showNewNoteForm() {
    showItemForm({
        mode: "create",
        kind: "file",
        targetFolder: "",
    });
}

function hideNewNoteForm() {
    const form = document.getElementById("new-note-form")!;
    const input = document.getElementById("new-note-input") as HTMLInputElement;
    filenameInputKeyboard?.reset();
    form.style.display = "none";
    input.value = "";
    input.placeholder = "Enter filename (without .md)";
    delete input.dataset.targetFolder;
    itemFormMode = "create";
    itemFormKind = "file";
    itemFormTargetPath = "";
    itemFormTargetFolder = "";
}

function showNewFolderForm(folderPath: string) {
    showItemForm({
        mode: "create",
        kind: "folder",
        targetFolder: folderPath,
    });
}

function showRenameForm(targetPath: string, isDir: boolean) {
    showItemForm({
        mode: "rename",
        kind: isDir ? "folder" : "file",
        targetPath,
    });
}

function showItemForm(options: {
    mode: "create" | "rename";
    kind: ItemKind;
    targetFolder?: string;
    targetPath?: string;
}) {
    const form = document.getElementById("new-note-form")!;
    const input = document.getElementById("new-note-input") as HTMLInputElement;
    const icon = document.getElementById("new-note-icon")!;
    const extension = document.getElementById("new-note-extension")!;
    const createButton = document.getElementById("new-note-create")!;

    itemFormMode = options.mode;
    itemFormKind = options.kind;
    itemFormTargetFolder = options.targetFolder || "";
    itemFormTargetPath = options.targetPath || "";
    filenameInputKeyboard?.reset();

    icon.innerHTML = renderIcon(options.kind === "folder" ? "folder-plus" : "file-plus");
    extension.textContent = options.kind === "folder" ? "" : ".md";
    extension.style.display = options.kind === "folder" ? "none" : "inline";
    createButton.textContent = options.mode === "rename" ? "Rename" : "Create";

    if (options.mode === "rename" && options.targetPath) {
        input.value = getDisplayName(options.targetPath, options.kind);
        input.placeholder = options.kind === "folder" ? "Rename folder" : "Rename file";
    } else if (options.kind === "folder") {
        input.value = "";
        input.placeholder = `New folder in ${itemFormTargetFolder || "root"}`;
    } else {
        input.value = "";
        input.placeholder = `New file in ${itemFormTargetFolder || "root"}`;
    }

    form.style.display = "block";
    input.focus();
    input.select();
}

async function createNewNote() {
    const input = document.getElementById("new-note-input") as HTMLInputElement;
    const enteredName = input.value;

    if (!enteredName.trim()) {
        input.focus();
        return;
    }

    try {
        if (itemFormMode === "create") {
            const relativePath = buildChildPath(itemFormTargetFolder, enteredName, itemFormKind);
            if (itemFormKind === "folder") {
                await FileService.CreateDirectory(relativePath);
                hideNewNoteForm();
                await loadFileTree();
                expandParentFolders(relativePath);
                updateFileTreeSelection(relativePath);
                announceOperation(`Created folder “${relativePath}”.`);
                return;
            }

            await FileService.CreateFile(relativePath, "");
            hideNewNoteForm();
            await loadFileTree();
            await LinkService.RebuildIndex();
            await openFile(relativePath, "markdown");
            announceOperation(`Created note “${relativePath}”.`);
            return;
        }

        const nextPath = buildRenamePath(itemFormTargetPath, enteredName, itemFormKind);
        if (nextPath === itemFormTargetPath) {
            hideNewNoteForm();
            return;
        }

        const previousPath = itemFormTargetPath;
        if (!await flushActiveDocumentBeforeSwitch()) {
            return;
        }
        await FileService.MoveFile(previousPath, nextPath);
        hideNewNoteForm();

        await updateCurrentPathsAfterMove(previousPath, nextPath, itemFormKind === "folder");
        await loadFileTree();
        updateFileTreeSelection(primaryDocumentRuntime.currentFilePath || nextPath);
        await LinkService.RebuildIndex();
        announceOperation(`Renamed “${previousPath}” to “${nextPath}”.`);
    } catch (err) {
        console.error("Failed to submit item form:", err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg.includes("exist")) {
            alert("同じ名前の項目がすでに存在します");
        } else {
            alert(errorMsg);
        }
    }
}

// Context Menu
function setupContextMenu() {
    const contextMenu = document.getElementById("context-menu")!;
    const ctxNewFile = document.getElementById("ctx-new-file")!;
    const ctxNewFolder = document.getElementById("ctx-new-folder")!;
    const ctxOpenFinder = document.getElementById("ctx-open-finder")!;
    const ctxOpenFile = document.getElementById("ctx-open-file")!;
    const ctxCopyPath = document.getElementById("ctx-copy-path")!;
    const ctxMove = document.getElementById("ctx-move")!;
    const ctxRename = document.getElementById("ctx-rename")!;
    const ctxDelete = document.getElementById("ctx-delete")!;

    const hideContextMenuOnOutsideInteraction = (event: Event) => {
        if (!isContextMenuVisible()) {
            return;
        }
        const target = event.target;
        if (target instanceof Node && contextMenu.contains(target)) {
            return;
        }
        hideContextMenu();
    };

    // Hide context menu on any interaction elsewhere.
    // Use capture phase to catch events before stopPropagation() is called.
    document.addEventListener("pointerdown", (e) => {
        hideContextMenuOnOutsideInteraction(e);
    }, true);

    document.addEventListener("click", (e) => {
        hideContextMenuOnOutsideInteraction(e);
    }, true);

    // Also hide on right-click elsewhere (contextmenu event)
    document.addEventListener("contextmenu", (e) => {
        hideContextMenuOnOutsideInteraction(e);
    }, true); // capture phase

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            hideContextMenu();
        }
    }, true);

    contextMenu.addEventListener("keydown", (event) => {
        const items = Array.from(contextMenu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
            .filter((item) => item.style.display !== "none");
        const currentIndex = items.indexOf(document.activeElement as HTMLElement);
        const nextIndex = moveMenuIndex(currentIndex < 0 ? 0 : currentIndex, items.length, event.key);
        if (nextIndex !== null) {
            event.preventDefault();
            items[nextIndex]?.focus();
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            (document.activeElement as HTMLElement | null)?.click();
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            hideContextMenu();
        }
    });

    document.addEventListener("scroll", () => {
        hideContextMenu();
    }, true);

    window.addEventListener("blur", () => {
        hideContextMenu();
    });

    window.addEventListener("resize", () => {
        hideContextMenu();
    });

    // Backdrop click/right-click dismisses context menu
    const backdrop = document.getElementById("context-menu-backdrop")!;
    backdrop.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        hideContextMenu();
    });
    backdrop.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        hideContextMenu();
    });

    fileTree.addEventListener("contextmenu", (e) => {
        if ((e.target as HTMLElement).closest(".file-item")) {
            return;
        }
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, "", true);
    });

    // Handle "New File" click
    ctxNewFile.addEventListener("click", () => {
        // Save path before hiding (hideContextMenu clears these)
        const targetPath = contextMenuTargetPath;
        const isDir = contextMenuTargetIsDir;
        hideContextMenu();
        showItemForm({
            mode: "create",
            kind: "file",
            targetFolder: resolveContextMenuTargetFolder(targetPath, isDir),
        });
    });

    ctxNewFolder.addEventListener("click", () => {
        const targetPath = contextMenuTargetPath;
        const isDir = contextMenuTargetIsDir;
        hideContextMenu();
        showNewFolderForm(resolveContextMenuTargetFolder(targetPath, isDir));
    });

    // Handle "Delete" click
    ctxDelete.addEventListener("click", async () => {
        // Save path before hiding (hideContextMenu clears these)
        const targetPath = contextMenuTargetPath;
        const isDir = contextMenuTargetIsDir;
        hideContextMenu();
        await deleteTargetPathWithArgs(targetPath, isDir);
    });

    ctxRename.addEventListener("click", async () => {
        const targetPath = contextMenuTargetPath;
        const isDir = contextMenuTargetIsDir;
        hideContextMenu();

        if (!isDir && primaryDocumentRuntime.currentFilePath !== targetPath) {
            await openFile(targetPath, "markdown");
        }
        showRenameForm(targetPath, isDir);
    });

    ctxOpenFinder.addEventListener("click", async () => {
        const targetPath = contextMenuTargetPath;
        hideContextMenu();
        if (!targetPath) {
            return;
        }
        try {
            await FileService.RevealInFinder(targetPath);
        } catch (err) {
            console.error("Failed to reveal in Finder:", err);
            alert(`Failed to open Finder: ${err}`);
        }
    });

    ctxOpenFile.addEventListener("click", async () => {
        const targetPath = contextMenuTargetPath;
        hideContextMenu();
        if (!targetPath) {
            return;
        }
        try {
            await FileService.OpenWithDefaultApp(targetPath);
        } catch (err) {
            console.error("Failed to open file:", err);
            alert(`Failed to open file: ${err}`);
        }
    });

    ctxCopyPath.addEventListener("click", async () => {
        const targetPath = contextMenuTargetPath;
        hideContextMenu();
        if (!targetPath) {
            return;
        }
        try {
            const absolutePath = await FileService.GetAbsolutePath(targetPath);
            await Clipboard.SetText(absolutePath);
        } catch (err) {
            console.error("Failed to copy file path:", err);
            alert(`Failed to copy file path: ${err}`);
        }
    });

    ctxMove.addEventListener("click", () => {
        const paths = selectedFilePaths.has(contextMenuTargetPath)
            ? Array.from(selectedFilePaths)
            : [contextMenuTargetPath];
        hideContextMenu();
        showMoveToFolderDialog(paths.filter(Boolean));
    });
}

function showContextMenu(x: number, y: number, path: string, isDir: boolean) {
    const contextMenu = document.getElementById("context-menu")!;
    const backdrop = document.getElementById("context-menu-backdrop")!;
    const ctxNewFile = document.getElementById("ctx-new-file")!;
    const ctxNewFolder = document.getElementById("ctx-new-folder")!;
    const ctxOpenFinder = document.getElementById("ctx-open-finder")!;
    const ctxOpenFile = document.getElementById("ctx-open-file")!;
    const ctxCopyPath = document.getElementById("ctx-copy-path")!;
    const ctxMove = document.getElementById("ctx-move")!;
    const ctxRename = document.getElementById("ctx-rename")!;
    const ctxDelete = document.getElementById("ctx-delete")!;
    const isRoot = path === "";

    contextMenuTargetPath = path;
    contextMenuTargetIsDir = isDir;
    contextMenuRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    ctxNewFile.style.display = "flex";
    ctxNewFolder.style.display = "flex";
    ctxOpenFinder.style.display = isDir && !isRoot ? "flex" : "none";
    ctxOpenFile.style.display = !isDir && !isRoot ? "flex" : "none";
    ctxCopyPath.style.display = isRoot ? "none" : "flex";
    ctxMove.style.display = isRoot ? "none" : "flex";
    ctxRename.style.display = isRoot ? "none" : "flex";
    ctxDelete.style.display = isRoot ? "none" : "flex";

    backdrop.style.display = "block";
    contextMenu.style.display = "block";
    contextMenu.style.left = x + "px";
    contextMenu.style.top = y + "px";

    // Ensure menu doesn't go off screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        contextMenu.style.left = (window.innerWidth - rect.width - 10) + "px";
    }
    if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = (window.innerHeight - rect.height - 10) + "px";
    }
    const firstMenuItem = Array.from(contextMenu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .find((item) => item.style.display !== "none");
    firstMenuItem?.focus();
}

function hideContextMenu() {
    const contextMenu = document.getElementById("context-menu")!;
    const backdrop = document.getElementById("context-menu-backdrop")!;
    contextMenu.style.display = "none";
    backdrop.style.display = "none";
    contextMenuTargetPath = "";
    contextMenuTargetIsDir = false;
    const restoreFocus = contextMenuRestoreFocus;
    contextMenuRestoreFocus = null;
    if (restoreFocus?.isConnected) {
        restoreFocus.focus();
    }
}

function showContextMenuForKeyboardItem(item: HTMLElement | undefined) {
    if (!item) return;
    const rect = item.getBoundingClientRect();
    showContextMenu(rect.left, rect.bottom, item.dataset.path || "", item.classList.contains("folder"));
}

function isContextMenuVisible(): boolean {
    const contextMenu = document.getElementById("context-menu")!;
    return contextMenu.style.display !== "none";
}

function resolveContextMenuTargetFolder(path: string, isDir: boolean): string {
    if (isDir) {
        return path;
    }
    const lastSlash = path.lastIndexOf("/");
    return lastSlash >= 0 ? path.slice(0, lastSlash) : "";
}

function showMoveToFolderDialog(sourcePaths: string[]) {
    const overlay = document.getElementById("move-to-folder-overlay") as HTMLElement;
    const input = document.getElementById("move-to-folder-input") as HTMLInputElement;
    const results = document.getElementById("move-to-folder-results") as HTMLElement;
    const folders = filterMoveDestinationFolders(
        ["", ...flattenFileTree(latestFileTree).filter((file) => file.isDir).map((file) => file.path)],
        sourcePaths,
    );
    const render = () => {
        const query = input.value.trim().toLocaleLowerCase();
        results.innerHTML = "";
        folders.filter((path) => path.toLocaleLowerCase().includes(query)).forEach((path) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "move-to-folder-option";
            button.setAttribute("role", "option");
            button.textContent = path || "Vault root";
            button.addEventListener("click", () => {
                overlay.style.display = "none";
                void movePathsToFolder(sourcePaths, path);
            });
            results.appendChild(button);
        });
    };
    input.value = "";
    input.oninput = render;
    overlay.style.display = "flex";
    render();
    input.focus();
}

function setupMoveToFolderDialog() {
    const overlay = document.getElementById("move-to-folder-overlay") as HTMLElement;
    document.getElementById("move-to-folder-cancel")!.addEventListener("click", () => {
        overlay.style.display = "none";
    });
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) overlay.style.display = "none";
    });
}

async function movePathsToFolder(sourcePaths: string[], targetFolder: string) {
    const moves = planMovesToFolder(sourcePaths, targetFolder);
    if (moves.length === 0) return;
    try {
        if (!await flushActiveDocumentBeforeSwitch()) {
            return;
        }
        for (const move of moves) {
            await FileService.MoveFile(move.sourcePath, move.nextPath);
            await updateCurrentPathsAfterMove(move.sourcePath, move.nextPath, findFileTreeEntry(latestFileTree, move.sourcePath)?.isDir === true);
        }
        await loadFileTree();
        await LinkService.RebuildIndex();
        selectedFilePaths = new Set(moves.map(({ nextPath }) => nextPath));
        fileTreeSelectionAnchor = moves.at(-1)?.nextPath || null;
        announceOperation(`Moved ${moves.length} item${moves.length === 1 ? "" : "s"} to ${targetFolder || "the vault root"}.`);
    } catch (err) {
        console.error("Failed to move selected paths:", err);
        announceOperation(`Could not move selected items: ${describeOperationError(err)}. Retry the move from the context menu.`, () => movePathsToFolder(sourcePaths, targetFolder));
    }
}

function findFileTreeEntry(files: FileInfo[], path: string): FileInfo | null {
    for (const file of files) {
        if (file.path === path) return file;
        const descendant = file.children ? findFileTreeEntry(file.children, path) : null;
        if (descendant) return descendant;
    }
    return null;
}

async function deleteTargetPathWithArgs(targetPath: string, isDir: boolean) {
    if (!targetPath) return;

    if (!await flushActiveDocumentBeforeSwitch()) {
        return;
    }
    try {
        deleteMode = normalizeDeleteMode(await ConfigService.GetDeleteMode());
    } catch (err) {
        console.error("Failed to load delete destination:", err);
        alert(`Failed to load delete destination: ${err}`);
        return;
    }

    const confirmed = await showDeleteConfirmDialog(targetPath, isDir);
    if (!confirmed) {
        return;
    }
    await performDeleteTargetPath(targetPath);
}

function setupDeleteConfirmDialog() {
    const overlay = document.getElementById("delete-confirm-overlay")!;
    const cancelButton = document.getElementById("delete-confirm-cancel")!;
    const confirmButton = document.getElementById("delete-confirm-submit")!;

    cancelButton.addEventListener("click", () => hideDeleteConfirmDialog());
    confirmButton.addEventListener("click", () => {
        hideDeleteConfirmDialog(true);
    });

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            hideDeleteConfirmDialog();
        }
    });
}

function setupWorkspaceDialogs() {
    document.getElementById("workspace-save-as-cancel")!.addEventListener("click", hideWorkspaceSaveAsDialog);
    document.getElementById("workspace-save-as-submit")!.addEventListener("click", () => void submitWorkspaceSaveAs());
    document.getElementById("workspace-save-as-input")!.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void submitWorkspaceSaveAs();
        }
    });
    document.getElementById("workspace-manage-close")!.addEventListener("click", hideWorkspaceManageDialog);
    document.getElementById("workspace-rename-cancel")!.addEventListener("click", hideWorkspaceRenameRow);
    document.getElementById("workspace-rename-submit")!.addEventListener("click", () => void submitWorkspaceRename());
    document.getElementById("workspace-rename-input")!.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void submitWorkspaceRename();
        }
    });
}

function showDeleteConfirmDialog(targetPath: string, isDir: boolean): Promise<boolean> {
    const overlay = document.getElementById("delete-confirm-overlay")!;
    const message = document.getElementById("delete-confirm-message")!;
    const confirmButton = document.getElementById("delete-confirm-submit") as HTMLButtonElement;

    const itemType = isDir ? "folder" : "file";
    message.textContent = `Send this ${itemType} to ${describeDeleteMode(deleteMode)}? ${targetPath}`;
    overlay.style.display = "flex";
    confirmButton.focus();

    return new Promise<boolean>((resolve) => {
        const cleanup = () => {
            overlay.removeEventListener("delete-confirm:resolve", onResolve as EventListener);
        };

        const onResolve = ((event: CustomEvent<boolean>) => {
            cleanup();
            resolve(event.detail);
        }) as EventListener;

        overlay.addEventListener("delete-confirm:resolve", onResolve);
    });
}

function hideDeleteConfirmDialog(confirmed = false) {
    const overlay = document.getElementById("delete-confirm-overlay")!;
    overlay.style.display = "none";
    overlay.dispatchEvent(new CustomEvent("delete-confirm:resolve", { detail: confirmed }));
}

async function performDeleteTargetPath(targetPath: string) {
    if (!targetPath) {
        return;
    }

    const deletedHistoryIdentity = primaryDocumentRuntime.activeEditableDocument
        && (primaryDocumentRuntime.activeEditableDocument.snapshot.path === targetPath
            || primaryDocumentRuntime.activeEditableDocument.snapshot.path.startsWith(`${targetPath}/`))
        ? documentHistoryIdentity(primaryDocumentRuntime.activeEditableDocument)
        : null;
    try {
        await FileService.Delete(targetPath);
        if (deletedHistoryIdentity) {
            documentHistory.drop(deletedHistoryIdentity);
        }
        await loadFileTree();

        if (primaryDocumentRuntime.currentFilePath && (primaryDocumentRuntime.currentFilePath === targetPath || primaryDocumentRuntime.currentFilePath.startsWith(`${targetPath}/`))) {
            clearCurrentSelection();
            await StateService.ClearLastOpenedFile();
        }
        announceOperation(`Deleted “${targetPath}”.`);
    } catch (err) {
        console.error("Failed to delete:", err);
        alert(`Failed to delete: ${err}`);
    }
}

function showNewNoteFormInFolder(folderPath: string) {
    showItemForm({
        mode: "create",
        kind: "file",
        targetFolder: folderPath,
    });
}

// Theme
function setupThemeMenu() {
    const selectedTheme = resolveThemeSelection(
        VALID_THEMES,
        appThemeFromConfig,
        localStorage.getItem("obails-theme"),
        DEFAULT_THEME
    );

    applyTheme(selectedTheme);

    Events.On("obails:theme-selected", (event) => {
        void persistTheme(String(event.data || ""));
    });

    window.addEventListener("obails:theme-selected", (event) => {
        const theme = (event as CustomEvent<string>).detail;
        void persistTheme(theme);
    });

    Events.On("obails:quick-switcher", () => {
        showQuickSwitcher();
    });
    window.addEventListener("obails:quick-switcher", () => {
        showQuickSwitcher();
    });
    Events.On("obails:new-note", () => {
        showNewNoteForm();
    });
    window.addEventListener("obails:new-note", () => {
        showNewNoteForm();
    });
    const runWorkspaceMenuCommand = (action: NamedWorkspaceAction) => {
        void runNamedWorkspaceAction(action);
    };
    window.addEventListener("obails:close-note", () => {
        void executeCommand("close-active-tab");
    });

    Events.On("obails:workspace-save-as", () => runWorkspaceMenuCommand({ type: "save-as" }));
    window.addEventListener("obails:workspace-save-as", () => runWorkspaceMenuCommand({ type: "save-as" }));
    Events.On("obails:workspace-save-current", () => runWorkspaceMenuCommand({ type: "save-current" }));
    window.addEventListener("obails:workspace-save-current", () => runWorkspaceMenuCommand({ type: "save-current" }));
    Events.On("obails:workspace-manage", () => runWorkspaceMenuCommand({ type: "manage" }));
    window.addEventListener("obails:workspace-manage", () => runWorkspaceMenuCommand({ type: "manage" }));
    Events.On("obails:workspace-open", (event) => {
        runWorkspaceMenuCommand({ type: "open", name: String(event.data || "") });
    });
    window.addEventListener("obails:workspace-open", (event) => {
        runWorkspaceMenuCommand({ type: "open", name: String((event as CustomEvent).detail || "") });
    });

    Events.On("obails:files-dropped", (event) => {
        const data = event.data as { files?: string[]; targetFolder?: string; targetKind?: string; notePath?: string } | null;
        const files = Array.isArray(data?.files) ? data.files : [];
        if (data?.targetKind === "markdown-editor") {
            void attachExternalFilesToCurrentNote(files, data.notePath || "");
            return;
        }
        void importExternalFiles(files, data?.targetFolder || "");
    });
    window.addEventListener("obails:files-dropped", (event) => {
        const data = (event as CustomEvent<{ files?: string[]; targetFolder?: string; targetKind?: string; notePath?: string } | null>).detail;
        const files = Array.isArray(data?.files) ? data.files : [];
        if (data?.targetKind === "markdown-editor") {
            void attachExternalFilesToCurrentNote(files, data.notePath || "");
            return;
        }
        void importExternalFiles(files, data?.targetFolder || "");
    });
    Events.On("obails:workspace-refresh", () => {
        void refreshWorkspaceFromBackend();
    });
}

function applyTheme(themeValue: string) {
    const theme = resolveThemeSelection(VALID_THEMES, themeValue, null, DEFAULT_THEME);
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("obails-theme", theme);

    initializeMermaid(theme);

    updatePreview();
}

async function persistTheme(themeValue: string) {
    const theme = resolveThemeSelection(VALID_THEMES, themeValue, null, DEFAULT_THEME);
    try {
        await ConfigService.SetTheme(theme);
        appThemeFromConfig = theme;
        applyTheme(theme);
        WindowService.SetMenuTheme(theme);
        (document.getElementById("settings-theme") as HTMLSelectElement).value = theme;
        if (document.getElementById("settings-overlay")?.style.display !== "none") {
            settingsStatus.textContent = "Saved theme setting.";
            settingsRetry.hidden = true;
        }
    } catch (err) {
        console.warn("Failed to save theme to config:", err);
        (document.getElementById("settings-theme") as HTMLSelectElement).value = appThemeFromConfig || DEFAULT_THEME;
        const message = `Could not save the theme: ${describeOperationError(err)}.`;
        showSettingsFailure(message, () => persistTheme(theme));
        announceOperation(`${message} Retry the last operation to save it.`, () => persistTheme(theme));
    }
}

function showEmptyMainPane() {
    editorContainer.style.display = "flex";
    editor.value = "";
    syncLineNumberGutters();
    preview.innerHTML = "Select a note from the file tree.";
    updatePaneTitles("Select a note...");
    outlineList.innerHTML = '<div class="outline-empty">Headings you write will gather here</div>';
    currentNote = null;
    primaryDocumentRuntime.clearActiveDocument();
    currentHtmlPath = null;
    currentTextPath = null;
    lastLoadedMarkdownContent = "";
    lastLoadedHtmlContent = "";
    lastLoadedTextContent = "";
    syncMarkdownAttachmentDropTarget();
}

// File Type Helpers
function getFileIcon(file: FileInfo): string {
    if (file.isDir) return renderIcon("folder-closed");

    const fileType = file.fileType || "other";
    switch (fileType) {
        case "markdown": return renderIcon("file-text");
        case "image": return renderIcon("file-image");
        case "pdf": return renderIcon("file-pdf");
        case "html": return renderIcon("file-code");
        case "audio": return renderIcon("file-audio");
        case "text": return renderIcon("file");
        default: return renderIcon("file");
    }
}

function getFileTypeFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'html' || ext === 'htm') return 'html';
    if (['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'opus'].includes(ext)) return 'audio';
    if (ext === 'txt') return 'text';
    return 'other';
}

function resolveFileType(fileType: string, path: string): string {
    const normalized = (fileType || "").toLowerCase();
    if (normalized === "markdown" || normalized === "image" || normalized === "pdf" || normalized === "html" || normalized === "audio" || normalized === "text") {
        return normalized;
    }
    return getFileTypeFromPath(path);
}

// Open file based on file type
type OpenFileOptions = {
    workspaceAlreadyOpen?: boolean;
};

async function openFile(path: string, fileType: string, options: OpenFileOptions = {}): Promise<void> {
    const resolvedType = resolveFileType(fileType, path);
    if (!options.workspaceAlreadyOpen) {
        const snapshot = popoutRoute
            ? await workspaceController.openTabInRoutedPopout(path, resolvedType, popoutRoute.paneId, popoutRoute.popoutId)
            : await workspaceController.openTab(path, resolvedType, activePaneId);
        if (!snapshot) return;
    }
    if (!await flushActiveDocumentBeforeSwitch()) {
        return;
    }

    if (activeRichSurface()) {
        const paneId = activePaneId;
        const runtime = primaryDocumentRuntime;
        await openRichSurfaceFile(path, resolvedType);
        if (isPersistedFileType(resolvedType)) {
            void persistLastOpenedFile(path, resolvedType, paneId, runtime, runtime.openGeneration);
        }
        saveActivePaneViewState();
        return;
    }

    const openedPaneId = activePaneId;
    const openedRuntime = primaryDocumentRuntime;
    const generation = openedRuntime.beginOpen();
    let opened = false;

    // 右サイドバー(OUTLINE/OUTGOING LINKS/BACKLINKS)はマークダウン専用情報のため、
    // 非マークダウン(音源/画像/PDF/HTML/テキスト)表示時は隠す。
    rightSidebar.style.display = resolvedType === "markdown" ? "flex" : "none";

    if (resolvedType !== "audio") {
        hideAllViewers();
        currentTextPath = null;
        lastLoadedTextContent = "";
        if (resolvedType !== "html") {
            currentHtmlPath = null;
        }
    }

    // Clear outline for non-markdown files (outline is only relevant for markdown)
    if (resolvedType !== "markdown" && resolvedType !== "audio") {
        outlineList.innerHTML = '<div class="outline-empty">Headings you write will gather here</div>';
        currentNote = null;
    }

    switch (resolvedType) {
        case "markdown":
            opened = await openNote(path, generation);
            if (!isCurrentOpenGeneration(generation, openedRuntime.openGeneration)) {
                return;
            }
            if (!opened) {
                await StateService.ClearLastOpenedFile();
                lastSyncedOpenedFile = "";
                showEmptyMainPane();
                return;
            }
            openedRuntime.currentFilePath = path;  // Track current file for refresh
            break;
        case "image":
            primaryDocumentRuntime.setNonEditablePath(path);
            await openImage(path);
            opened = true;
            break;
        case "pdf":
            primaryDocumentRuntime.setNonEditablePath(path);
            await openPDF(path);
            opened = true;
            break;
        case "html":
            opened = await openHTML(path, generation);
            if (!isCurrentOpenGeneration(generation, openedRuntime.openGeneration)) {
                return;
            }
            break;
        case "text":
            opened = await openText(path, generation);
            if (!isCurrentOpenGeneration(generation, openedRuntime.openGeneration)) {
                return;
            }
            break;
        case "audio":
            primaryDocumentRuntime.setNonEditablePath(path);
            await openAudio(path);
            opened = true;
            break;
        default:
            opened = true;
            primaryDocumentRuntime.setNonEditablePath(path);
            // Open with system default app (macOS open command)
            await openExternal(path);
            break;
    }

    if (!opened) {
        showEmptyMainPane();
        throw new Error("Failed to open file.");
    }

    syncMarkdownAttachmentDropTarget();

    if (isCurrentOpenGeneration(generation, openedRuntime.openGeneration) && isPersistedFileType(resolvedType)) {
        void persistLastOpenedFile(path, resolvedType, openedPaneId, openedRuntime, generation);
    }
    saveActivePaneViewState();
}

function isPersistedFileType(fileType: string): boolean {
    return fileType === "markdown" || fileType === "image" || fileType === "pdf" || fileType === "html" || fileType === "text";
}

function persistLastOpenedFile(path: string, fileType: string, paneId: string, runtime: PrimaryDocumentRuntime, generation: number): Promise<void> {
    lastOpenedFilePersistence = lastOpenedFilePersistence.then(async () => {
        if (!documentRuntimeFactory.canPublishLocal(paneId, runtime, generation)) {
            return;
        }
        try {
            await StateService.SetLastOpenedFile(path, fileType);
        } catch (err) {
            console.warn("Failed to persist last opened file:", err);
        }
    });
    return lastOpenedFilePersistence;
}

function clearPersistedLastOpenedFile(): Promise<void> {
    lastOpenedFilePersistence = lastOpenedFilePersistence.then(async () => {
        try {
            await StateService.ClearLastOpenedFile();
        } catch (err) {
            console.warn("Failed to clear last opened file:", err);
        }
    });
    return lastOpenedFilePersistence;
}

// Hide all viewer panels
function hideAllViewers() {
    const surface = activeRichSurface();
    if (surface) {
        hideRichSurfaceViewers(surface);
        return;
    }
    editorContainer.style.display = "none";
    timelinePanel.style.display = "none";
    imageViewer.style.display = "none";
    pdfViewer.style.display = "none";
    htmlEditorContainer.style.display = "none";
}

// 倍速メニューの選択肢を生成する（初回のみ）
function buildSpeedMenu() {
    if (speedMenu.childElementCount > 0) return;
    for (const speed of PLAYBACK_SPEEDS) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "speed-menu-item";
        item.setAttribute("role", "menuitemradio");
        item.dataset.speed = String(speed);
        item.textContent = formatSpeedLabel(speed);
        item.addEventListener("click", () => {
            applyPlaybackSpeed(speed);
            closeSpeedMenu();
        });
        speedMenu.appendChild(item);
    }
}

// 速度を実際の audio 要素・UI・保存先に反映する
function applyPlaybackSpeed(speed: number) {
    currentPlaybackSpeed = speed;
    miniAudioPlayer.playbackRate = speed;
    speedBtn.textContent = formatSpeedLabel(speed);
    storeSpeed(window.localStorage, speed);
    for (const el of Array.from(speedMenu.children) as HTMLElement[]) {
        const isActive = Number(el.dataset.speed) === speed;
        el.classList.toggle("active", isActive);
        el.setAttribute("aria-checked", isActive ? "true" : "false");
    }
}

function openSpeedMenu() {
    buildSpeedMenu();
    speedMenu.hidden = false;
    speedBtn.setAttribute("aria-expanded", "true");
}

function closeSpeedMenu() {
    speedMenu.hidden = true;
    speedBtn.setAttribute("aria-expanded", "false");
}

function toggleSpeedMenu() {
    if (speedMenu.hidden) {
        openSpeedMenu();
    } else {
        closeSpeedMenu();
    }
}

function toggleAudioLoopMode() {
    audioLoopMode = audioLoopMode === "loop" ? "one" : "loop";
    storeAudioLoopMode(window.localStorage, audioLoopMode);
    syncAudioLoopButton();
}

function syncAudioLoopButton() {
    const isOneLoop = audioLoopMode === "one";
    audioLoopBtn.textContent = isOneLoop ? "1Loop" : "Loop";
    audioLoopBtn.setAttribute("aria-pressed", isOneLoop ? "true" : "false");
    audioLoopBtn.title = isOneLoop ? "Repeat current audio" : "Loop through this folder";
    audioLoopBtn.setAttribute("aria-label", audioLoopBtn.title);
}

async function openAudio(path: string): Promise<void> {
    try {
        currentAudioPath = path;
        const fileName = path.split('/').pop() || 'Audio';

        miniAudioPlayer.src = `/media/audio?path=${encodeURIComponent(path)}`;
        miniPlayerTitle.textContent = fileName;
        miniPlayer.style.display = "flex";
        // 新しいソースを読み込むと playbackRate が 1 にリセットされるため、選択中の速度を再適用
        applyPlaybackSpeed(currentPlaybackSpeed);

        updateFileTreeSelection(path);
        syncAudioPlaybackBadges();
        void miniAudioPlayer.play()
            .catch(() => undefined)
            .then(syncAudioPlaybackBadges);
        void refreshTranscribeButton(path);
    } catch (err) {
        console.error("Failed to open audio:", err);
        alert(`Failed to open audio: ${err}`);
        throw err;
    }
}

// 文字起こしボタンの状態を、対象音源に既存の文字起こし.mdがあるかで出し分ける。
async function refreshTranscribeButton(audioPath: string): Promise<void> {
    transcribeBtn.disabled = false;
    transcribeBtn.classList.remove("is-busy");
    try {
        const has = await TranscribeService.HasTranscript(audioPath);
        transcribeBtn.textContent = has ? "文字起こしを開く" : "文字起こし";
    } catch (err) {
        console.warn("Failed to check transcript:", err);
        transcribeBtn.textContent = "文字起こし";
    }
}

// 文字起こしボタン押下: 既存なら即.mdを開く。無ければ文字起こし→.md生成→エディタで開く。
async function handleTranscribeClick(): Promise<void> {
    const audioPath = currentAudioPath;
    if (!audioPath) return;

    const mdPath = transcriptPathForAudio(audioPath);
    const alreadyDone = transcribeBtn.textContent === "文字起こしを開く";

    if (alreadyDone) {
        await openFile(mdPath, "markdown");
        return;
    }

    const prevLabel = transcribeBtn.textContent;
    transcribeBtn.disabled = true;
    transcribeBtn.classList.add("is-busy");
    transcribeBtn.textContent = "文字起こし中…";
    try {
        const createdPath = await TranscribeService.Transcribe(audioPath);
        transcribeBtn.classList.remove("is-busy");
        transcribeBtn.disabled = false;
        transcribeBtn.textContent = "文字起こしを開く";
        await openFile(createdPath || mdPath, "markdown");
    } catch (err) {
        console.error("Transcription failed:", err);
        alert(`文字起こしに失敗しました: ${err}`);
        transcribeBtn.classList.remove("is-busy");
        transcribeBtn.disabled = false;
        transcribeBtn.textContent = prevLabel || "文字起こし";
    }
}

// シーク操作中はユーザーのドラッグ位置を優先し、timeupdate での上書きを止める
let isSeeking = false;

// カスタムプレイヤー（再生/一時停止ボタン・シークバー・経過/全体時間）を一度だけ配線する。
function setupCustomAudioControls() {
    syncPlayPauseIcon();

    miniPlayerPlayPause.addEventListener("click", () => {
        if (miniAudioPlayer.paused) {
            void miniAudioPlayer.play().catch(() => undefined);
        } else {
            miniAudioPlayer.pause();
        }
    });

    miniAudioPlayer.addEventListener("play", syncPlayPauseIcon);
    miniAudioPlayer.addEventListener("pause", syncPlayPauseIcon);
    miniAudioPlayer.addEventListener("play", syncAudioPlaybackBadges);
    miniAudioPlayer.addEventListener("pause", syncAudioPlaybackBadges);
    miniAudioPlayer.addEventListener("ended", () => void handleAudioEnded());

    miniAudioPlayer.addEventListener("durationchange", updatePlayerDuration);
    miniAudioPlayer.addEventListener("timeupdate", () => {
        if (!isSeeking) updatePlayerProgress();
    });

    // クリック/ドラッグした位置へ即座にシーク（input中はその時点の値で頭出し）
    miniPlayerSeek.addEventListener("input", () => {
        isSeeking = true;
        const value = Number(miniPlayerSeek.value);
        miniPlayerCurrent.textContent = formatPlaybackTime(value);
        updateSeekFill();
    });
    miniPlayerSeek.addEventListener("change", () => {
        const value = Number(miniPlayerSeek.value);
        if (Number.isFinite(value)) {
            miniAudioPlayer.currentTime = value;
        }
        isSeeking = false;
        updatePlayerProgress();
    });
}

async function handleAudioEnded(): Promise<void> {
    const endedPath = currentAudioPath;
    if (!endedPath) {
        syncPlayPauseIcon();
        syncAudioPlaybackBadges();
        return;
    }

    markAudioDone(endedPath);
    syncPlayPauseIcon();

    const nextPath = getNextAudioPath(latestFileTree, endedPath, audioLoopMode);
    if (!nextPath) {
        syncAudioPlaybackBadges();
        return;
    }

    await openAudio(nextPath);
}

function markAudioDone(path: string) {
    doneAudioPaths.add(path);
    storeDoneAudioPaths(window.localStorage, doneAudioPaths);
}

function syncAudioPlaybackBadges() {
    document.querySelectorAll<HTMLElement>(".file-item.file").forEach((item) => {
        const path = item.dataset.path || "";
        const badge = item.querySelector<HTMLElement>("[data-playback-badge]");
        if (!badge) {
            return;
        }

        const isPlaying = path === currentAudioPath && !miniAudioPlayer.paused && !miniAudioPlayer.ended;
        const isDone = doneAudioPaths.has(path);
        badge.classList.toggle("is-playing", isPlaying);
        badge.classList.toggle("is-done", !isPlaying && isDone);

        if (isPlaying) {
            badge.textContent = "再生中";
            badge.hidden = false;
        } else if (isDone) {
            badge.textContent = "済み";
            badge.hidden = false;
        } else {
            badge.textContent = "";
            badge.hidden = true;
        }
    });
}

// 再生/一時停止ボタンのアイコンを現在の状態に合わせる
function syncPlayPauseIcon() {
    const icon = miniAudioPlayer.paused ? "play" : "pause";
    miniPlayerPlayPause.innerHTML = renderIcon(icon);
}

// 全体の長さをシークバーの max と表示ラベルに反映する
function updatePlayerDuration() {
    const duration = miniAudioPlayer.duration;
    if (Number.isFinite(duration) && duration > 0) {
        miniPlayerSeek.max = String(duration);
        miniPlayerDuration.textContent = formatPlaybackTime(duration);
    } else {
        miniPlayerSeek.max = "0";
        miniPlayerDuration.textContent = "0:00";
    }
    updateSeekFill();
}

// 現在の再生位置をシークバーの値・経過時間ラベル・塗りに反映する
function updatePlayerProgress() {
    const current = miniAudioPlayer.currentTime;
    miniPlayerSeek.value = String(Number.isFinite(current) ? current : 0);
    miniPlayerCurrent.textContent = formatPlaybackTime(current);
    updateSeekFill();
}

// シークバーの進捗塗り（再生済み部分を accent 色で）を CSS 変数で更新する
function updateSeekFill() {
    const max = Number(miniPlayerSeek.max);
    const value = Number(miniPlayerSeek.value);
    const ratio = max > 0 && Number.isFinite(value) ? (value / max) * 100 : 0;
    miniPlayerSeek.style.setProperty("--seek-progress", `${Math.min(100, Math.max(0, ratio))}%`);
}

function stopAudioPlayback() {
    const previousAudioPath = currentAudioPath;
    miniAudioPlayer.pause();
    miniAudioPlayer.removeAttribute("src");
    miniAudioPlayer.load();
    miniPlayerTitle.textContent = "No audio";
    miniPlayer.style.display = "none";
    currentAudioPath = null;
    isSeeking = false;
    miniPlayerSeek.value = "0";
    miniPlayerSeek.max = "0";
    miniPlayerCurrent.textContent = "0:00";
    miniPlayerDuration.textContent = "0:00";
    updateSeekFill();
    syncPlayPauseIcon();
    if (previousAudioPath) {
        syncAudioPlaybackBadges();
    }
}

// Open image file
async function openImage(path: string): Promise<void> {
    try {
        const base64Data = await FileService.ReadBinaryFile(path);
        const ext = path.split('.').pop()?.toLowerCase() || 'png';
        const mimeType = getMimeTypeFromExt(ext);

        imagePreview.src = `data:${mimeType};base64,${base64Data}`;
        imageTitle.textContent = path.split('/').pop() || 'Image';
        imageViewer.style.display = "block";

        // Update file tree selection
        updateFileTreeSelection(path);
    } catch (err) {
        console.error("Failed to open image:", err);
        alert(`Failed to open image: ${err}`);
    }
}

function decodePdfData(base64Data: string): Uint8Array {
    const binaryData = atob(base64Data);
    const byteArray = new Uint8Array(binaryData.length);
    for (let index = 0; index < binaryData.length; index += 1) byteArray[index] = binaryData.charCodeAt(index);
    return byteArray;
}

function richPdfActiveContainer(surface: RichSurface, session: RichPdfSession): HTMLElement {
    return session.activeBuffer === "a" ? surface.pdfContainerA : surface.pdfContainerB;
}

function richPdfBackContainer(surface: RichSurface, session: RichPdfSession): HTMLElement {
    return session.activeBuffer === "a" ? surface.pdfContainerB : surface.pdfContainerA;
}

function updateRichPdfInfo(surface: RichSurface, session: RichPdfSession, fullscreen = false): void {
    const pageText = session.viewMode === "continuous"
        ? `${session.totalPages} pages`
        : `${session.currentPage} / ${session.totalPages}`;
    const zoomText = `${Math.round(session.scale * 100)}%`;
    surface.pdfPageInfo.textContent = pageText;
    surface.pdfZoomInfo.textContent = zoomText;
    const nextModeTitle = session.viewMode === "continuous" ? "Switch to Single Page" : "Switch to Continuous Scroll";
    surface.pdfViewModeButton.title = nextModeTitle;
    surface.pdfViewModeButton.setAttribute("aria-label", nextModeTitle);
    setButtonIcon(surface.pdfViewModeButton, session.viewMode === "continuous" ? "page-single" : "page-continuous");
    if (fullscreen) {
        pdfFsPageInfo.textContent = pageText;
        pdfFsZoomInfo.textContent = zoomText;
        const fullscreenModeButton = document.getElementById("pdf-fs-view-mode") as HTMLButtonElement;
        fullscreenModeButton.title = nextModeTitle;
        fullscreenModeButton.setAttribute("aria-label", nextModeTitle);
        setButtonIcon(fullscreenModeButton, session.viewMode === "continuous" ? "page-single" : "page-continuous");
    }
}

async function renderRichPdfCanvas(session: RichPdfSession, pageNumber: number, canvas: HTMLCanvasElement): Promise<void> {
    const page = await session.document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: session.scale });
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
}

async function renderRichPdfPages(
    surface: RichSurface,
    session: RichPdfSession,
    container: HTMLElement,
    targetPage = session.currentPage,
): Promise<HTMLCanvasElement[]> {
    container.replaceChildren();
    const canvases: HTMLCanvasElement[] = [];
    const pages = session.viewMode === "continuous"
        ? Array.from({ length: session.totalPages }, (_, index) => index + 1)
        : [session.currentPage];
    for (const pageNumber of pages) {
        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page-canvas";
        canvas.dataset.page = String(pageNumber);
        container.append(canvas);
        canvases.push(canvas);
        await renderRichPdfCanvas(session, pageNumber, canvas);
    }
    if (session.viewMode === "continuous") scrollToPage(container, targetPage, canvases);
    return canvases;
}

async function renderRichPdfInActiveBuffer(surface: RichSurface, session: RichPdfSession): Promise<void> {
    const canvases = await renderRichPdfPages(surface, session, richPdfActiveContainer(surface, session));
    if (richPdfSessions.get(surface.paneId) === session) session.canvases = canvases;
}

async function openRichPdf(path: string, surface: RichSurface, runtime: PrimaryDocumentRuntime, generation: number): Promise<void> {
    try {
        const base64Data = await FileService.ReadBinaryFile(path);
        if (!canPublishRichBinary(surface, runtime, generation)) return;
        const loadingTask = pdfjsLib.getDocument({ data: decodePdfData(base64Data) });
        const document = await loadingTask.promise;
        if (!canPublishRichBinary(surface, runtime, generation)) return;
        const session: RichPdfSession = {
            paneId: surface.paneId,
            path,
            generation,
            document,
            currentPage: 1,
            totalPages: document.numPages,
            scale: 1,
            viewMode: "continuous",
            activeBuffer: "a",
            canvases: [],
        };
        richPdfSessions.set(surface.paneId, session);
        surface.pdfContainerA.replaceChildren();
        surface.pdfContainerB.replaceChildren();
        surface.pdfContainerA.classList.add("pdf-buffer-active");
        surface.pdfContainerA.classList.remove("pdf-buffer-back");
        surface.pdfContainerB.classList.add("pdf-buffer-back");
        surface.pdfContainerB.classList.remove("pdf-buffer-active");
        surface.pdfTitle.textContent = path.split("/").pop() || "PDF";
        surface.pdfViewer.style.display = "flex";
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (!canPublishRichBinary(surface, runtime, generation) || richPdfSessions.get(surface.paneId) !== session) return;
        const firstPage = await document.getPage(1);
        if (!canPublishRichBinary(surface, runtime, generation) || richPdfSessions.get(surface.paneId) !== session) return;
        const viewport = firstPage.getViewport({ scale: 1 });
        const width = surface.pdfContainerA.clientWidth - PDF_FIT_WIDTH_PADDING;
        session.scale = width > PDF_FIT_MIN_CONTAINER_WIDTH
            ? Math.min(Math.max(width / viewport.width, PDF_FIT_MIN_SCALE), PDF_FIT_MAX_SCALE)
            : 1;
        updateRichPdfInfo(surface, session);
        await renderRichPdfInActiveBuffer(surface, session);
    } catch (error) {
        if (canPublishRichBinary(surface, runtime, generation)) {
            announceOperation(`Could not open ${path}: ${describeOperationError(error)}.`);
        }
    }
}

function swapRichPdfBuffers(surface: RichSurface, session: RichPdfSession): void {
    const active = richPdfActiveContainer(surface, session);
    const back = richPdfBackContainer(surface, session);
    active.classList.remove("pdf-buffer-active");
    active.classList.add("pdf-buffer-back");
    back.classList.remove("pdf-buffer-back");
    back.classList.add("pdf-buffer-active");
    session.activeBuffer = session.activeBuffer === "a" ? "b" : "a";
}

async function toggleRichPdfViewMode(surface: RichSurface): Promise<void> {
    const session = richPdfSessions.get(surface.paneId);
    if (!session) return;
    if (session.viewMode === "continuous") session.currentPage = getCurrentPageFromScroll(richPdfActiveContainer(surface, session), session.canvases, session.totalPages);
    const targetPage = session.currentPage;
    session.viewMode = session.viewMode === "continuous" ? "single" : "continuous";
    updateRichPdfInfo(surface, session);
    const canvases = await renderRichPdfPages(surface, session, richPdfBackContainer(surface, session), targetPage);
    if (richPdfSessions.get(surface.paneId) !== session) return;
    swapRichPdfBuffers(surface, session);
    session.canvases = canvases;
}

async function richPdfPreviousPage(surface: RichSurface): Promise<void> {
    const session = richPdfSessions.get(surface.paneId);
    if (!session || session.viewMode === "continuous" || session.currentPage <= 1) return;
    session.currentPage -= 1;
    updateRichPdfInfo(surface, session);
    await renderRichPdfInActiveBuffer(surface, session);
}

async function richPdfNextPage(surface: RichSurface): Promise<void> {
    const session = richPdfSessions.get(surface.paneId);
    if (!session || session.viewMode === "continuous" || session.currentPage >= session.totalPages) return;
    session.currentPage += 1;
    updateRichPdfInfo(surface, session);
    await renderRichPdfInActiveBuffer(surface, session);
}

async function richPdfZoomIn(surface: RichSurface): Promise<void> {
    const session = richPdfSessions.get(surface.paneId);
    if (!session) return;
    session.scale = Math.min(session.scale * PDF_ZOOM_IN_FACTOR, PDF_MAX_SCALE);
    updateRichPdfInfo(surface, session);
    await renderRichPdfInActiveBuffer(surface, session);
}

async function richPdfZoomOut(surface: RichSurface): Promise<void> {
    const session = richPdfSessions.get(surface.paneId);
    if (!session) return;
    session.scale = Math.max(session.scale * PDF_ZOOM_OUT_FACTOR, PDF_MIN_SCALE);
    updateRichPdfInfo(surface, session);
    await renderRichPdfInActiveBuffer(surface, session);
}

async function openRichPdfFullscreen(surface: RichSurface): Promise<void> {
    const session = richPdfSessions.get(surface.paneId);
    if (!session) return;
    richPdfFullscreen = { surface, session };
    pdfFsTitle.textContent = surface.pdfTitle.textContent || "PDF";
    pdfFullscreenOverlay.style.display = "flex";
    updateRichPdfInfo(surface, session, true);
    const canvases = await renderRichPdfPages(surface, session, pdfFsContainer);
    if (richPdfFullscreen?.session === session) session.canvases = canvases;
}

async function closeRichPdfFullscreen(): Promise<void> {
    const current = richPdfFullscreen;
    if (!current) return;
    richPdfFullscreen = null;
    pdfFullscreenOverlay.style.display = "none";
    await renderRichPdfInActiveBuffer(current.surface, current.session);
}

// Open PDF file with PDF.js
async function openPDF(path: string): Promise<void> {
    try {
        currentPdfPath = path;
        const base64Data = await FileService.ReadBinaryFile(path);
        const binaryData = atob(base64Data);
        const byteArray = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
            byteArray[i] = binaryData.charCodeAt(i);
        }

        // Load PDF document
        const loadingTask = pdfjsLib.getDocument({ data: byteArray });
        pdfDoc = await loadingTask.promise;
        pdfTotalPages = pdfDoc.numPages;
        pdfCurrentPage = 1;

        const fileName = path.split('/').pop() || 'PDF';
        pdfTitle.textContent = fileName;
        pdfViewer.style.display = "flex";

        // Wait for layout to complete before calculating scale
        await new Promise(resolve => requestAnimationFrame(resolve));

        // Calculate initial scale to fit width
        const firstPage = await pdfDoc.getPage(1);
        const unscaledViewport = firstPage.getViewport({ scale: 1 });
        const containerWidth = pdfContainerA.clientWidth - 40; // padding

        // Ensure minimum scale and handle case when container isn't sized yet
        if (containerWidth > 100) {
            pdfScale = Math.min(Math.max(containerWidth / unscaledViewport.width, 0.5), 2.0);
        } else {
            pdfScale = 1.0; // Default scale if container not ready
        }

        // Update UI and render pages
        updatePdfInfo();
        await renderPdfPages();

        // Update file tree selection
        updateFileTreeSelection(path);
    } catch (err) {
        console.error("Failed to open PDF:", err);
        alert(`Failed to open PDF: ${err}`);
    }
}

// Get the active PDF container
function getPdfActiveContainer(): HTMLElement {
    if (pdfIsFullscreen) return pdfFsContainer;
    return pdfActiveBuffer === 'a' ? pdfContainerA : pdfContainerB;
}

// Get the back buffer for rendering
function getPdfBackContainer(): HTMLElement {
    if (pdfIsFullscreen) return pdfFsContainer;
    return pdfActiveBuffer === 'a' ? pdfContainerB : pdfContainerA;
}

// Swap buffers
function swapPdfBuffers(): void {
    if (pdfIsFullscreen) return;

    const activeContainer = pdfActiveBuffer === 'a' ? pdfContainerA : pdfContainerB;
    const backContainer = pdfActiveBuffer === 'a' ? pdfContainerB : pdfContainerA;

    // Swap classes
    activeContainer.classList.remove('pdf-buffer-active');
    activeContainer.classList.add('pdf-buffer-back');
    backContainer.classList.remove('pdf-buffer-back');
    backContainer.classList.add('pdf-buffer-active');

    // Update active buffer tracker
    pdfActiveBuffer = pdfActiveBuffer === 'a' ? 'b' : 'a';
}

// Render PDF pages based on view mode (to active container)
async function renderPdfPages(): Promise<void> {
    if (!pdfDoc) return;

    const container = getPdfActiveContainer();
    container.innerHTML = '';
    pdfCanvases = [];

    if (pdfViewMode === 'continuous') {
        // Render all pages
        for (let i = 1; i <= pdfTotalPages; i++) {
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page-canvas';
            canvas.dataset.page = String(i);
            container.appendChild(canvas);
            pdfCanvases.push(canvas);
        }
        // Render all pages
        await renderAllPages();
    } else {
        // Single page mode - render only current page
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        canvas.dataset.page = String(pdfCurrentPage);
        container.appendChild(canvas);
        pdfCanvases.push(canvas);
        await renderSinglePage(pdfCurrentPage, canvas);
    }
}

// Render PDF pages to back buffer (for double buffering)
async function renderPdfPagesToBackBuffer(targetPage: number): Promise<HTMLCanvasElement[]> {
    if (!pdfDoc) return [];

    const container = getPdfBackContainer();
    container.innerHTML = '';
    const canvases: HTMLCanvasElement[] = [];

    if (pdfViewMode === 'continuous') {
        // Render all pages
        for (let i = 1; i <= pdfTotalPages; i++) {
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page-canvas';
            canvas.dataset.page = String(i);
            container.appendChild(canvas);
            canvases.push(canvas);
        }
        // Render all pages
        for (let i = 0; i < canvases.length; i++) {
            await renderSinglePage(i + 1, canvases[i]);
        }
        // Set scroll position before showing (use local canvases array!)
        scrollToPage(container, targetPage, canvases);
    } else {
        // Single page mode - render only current page
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        canvas.dataset.page = String(pdfCurrentPage);
        container.appendChild(canvas);
        canvases.push(canvas);
        await renderSinglePage(pdfCurrentPage, canvas);
    }

    return canvases;
}

// Render all pages (for continuous mode)
async function renderAllPages(): Promise<void> {
    if (!pdfDoc) return;

    for (let i = 0; i < pdfCanvases.length; i++) {
        await renderSinglePage(i + 1, pdfCanvases[i]);
    }
}

// Render a single page to a specific canvas
async function renderSinglePage(pageNum: number, canvas: HTMLCanvasElement): Promise<void> {
    if (!pdfDoc) return;

    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: pdfScale });

        const context = canvas.getContext("2d")!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;
    } catch (err) {
        console.error(`Failed to render PDF page ${pageNum}:`, err);
    }
}

// Update PDF info display
function updatePdfInfo() {
    const pageText = pdfViewMode === 'continuous'
        ? `${pdfTotalPages} pages`
        : `${pdfCurrentPage} / ${pdfTotalPages}`;
    const zoomText = `${Math.round(pdfScale * 100)}%`;

    pdfPageInfo.textContent = pageText;
    pdfZoomInfo.textContent = zoomText;

    if (pdfIsFullscreen) {
        pdfFsPageInfo.textContent = pageText;
        pdfFsZoomInfo.textContent = zoomText;
    }

    // Update view mode button icon
    const viewModeBtn = document.getElementById("pdf-view-mode")!;
    const viewModeFsBtn = document.getElementById("pdf-fs-view-mode")!;
    const icon = renderIcon(pdfViewMode === 'continuous' ? 'page-single' : 'page-continuous');
    viewModeBtn.innerHTML = icon;
    viewModeFsBtn.innerHTML = icon;
    viewModeBtn.title = pdfViewMode === 'continuous' ? 'Switch to Single Page' : 'Switch to Continuous Scroll';
    viewModeFsBtn.title = viewModeBtn.title;
}

// Toggle view mode with double buffering
async function togglePdfViewMode() {
    if (richPdfFullscreen) {
        const { surface, session } = richPdfFullscreen;
        if (session.viewMode === "continuous") session.currentPage = getCurrentPageFromScroll(pdfFsContainer, session.canvases, session.totalPages);
        session.viewMode = session.viewMode === "continuous" ? "single" : "continuous";
        updateRichPdfInfo(surface, session, true);
        session.canvases = await renderRichPdfPages(surface, session, pdfFsContainer);
        return;
    }
    const activeContainer = getPdfActiveContainer();

    // Save current page before switching
    if (pdfViewMode === 'continuous') {
        // Calculate current page from scroll position
        pdfCurrentPage = getCurrentPageFromScroll(activeContainer);
    }

    const targetPage = pdfCurrentPage;
    pdfViewMode = pdfViewMode === 'continuous' ? 'single' : 'continuous';
    updatePdfInfo();

    // Render to back buffer
    const newCanvases = await renderPdfPagesToBackBuffer(targetPage);

    // Swap buffers (instantly shows the pre-rendered content)
    swapPdfBuffers();

    // Update canvas reference
    pdfCanvases = newCanvases;
}

// Get current page from scroll position in continuous mode
function getCurrentPageFromScroll(
    container: HTMLElement,
    canvases = pdfCanvases,
    totalPages = pdfTotalPages,
): number {
    if (canvases.length === 0) return 1;

    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const scrollCenter = scrollTop + containerHeight / 3; // Use upper third as reference

    for (let i = 0; i < canvases.length; i++) {
        const canvas = canvases[i];
        const canvasTop = canvas.offsetTop;
        const canvasBottom = canvasTop + canvas.height;

        if (scrollCenter >= canvasTop && scrollCenter < canvasBottom) {
            return i + 1;
        }
    }

    return totalPages; // Default to last page if at bottom
}

// Scroll to specific page in continuous mode
function scrollToPage(container: HTMLElement, pageNum: number, canvases?: HTMLCanvasElement[]): void {
    const targetCanvases = canvases || pdfCanvases;
    const index = pageNum - 1;
    if (index >= 0 && index < targetCanvases.length) {
        const canvas = targetCanvases[index];
        container.scrollTo({
            top: canvas.offsetTop - PDF_SCROLL_PAGE_OFFSET, // Small offset for padding
            behavior: 'auto'
        });
    }
}

// PDF navigation functions (only for single page mode)
async function pdfPrevPage() {
    if (richPdfFullscreen) {
        const { surface, session } = richPdfFullscreen;
        if (session.viewMode === "continuous" || session.currentPage <= 1) return;
        session.currentPage -= 1;
        updateRichPdfInfo(surface, session, true);
        session.canvases = await renderRichPdfPages(surface, session, pdfFsContainer);
        return;
    }
    if (pdfViewMode === 'continuous' || pdfCurrentPage <= 1) return;
    pdfCurrentPage--;
    updatePdfInfo();
    await renderPdfPages();
}

async function pdfNextPage() {
    if (richPdfFullscreen) {
        const { surface, session } = richPdfFullscreen;
        if (session.viewMode === "continuous" || session.currentPage >= session.totalPages) return;
        session.currentPage += 1;
        updateRichPdfInfo(surface, session, true);
        session.canvases = await renderRichPdfPages(surface, session, pdfFsContainer);
        return;
    }
    if (pdfViewMode === 'continuous' || pdfCurrentPage >= pdfTotalPages) return;
    pdfCurrentPage++;
    updatePdfInfo();
    await renderPdfPages();
}

async function pdfZoomIn() {
    if (richPdfFullscreen) {
        const { surface, session } = richPdfFullscreen;
        session.scale = Math.min(session.scale * PDF_ZOOM_IN_FACTOR, PDF_MAX_SCALE);
        updateRichPdfInfo(surface, session, true);
        session.canvases = await renderRichPdfPages(surface, session, pdfFsContainer);
        return;
    }
    pdfScale = Math.min(pdfScale * 1.25, 5.0);
    updatePdfInfo();
    await renderPdfPages();
}

async function pdfZoomOut() {
    if (richPdfFullscreen) {
        const { surface, session } = richPdfFullscreen;
        session.scale = Math.max(session.scale * PDF_ZOOM_OUT_FACTOR, PDF_MIN_SCALE);
        updateRichPdfInfo(surface, session, true);
        session.canvases = await renderRichPdfPages(surface, session, pdfFsContainer);
        return;
    }
    pdfScale = Math.max(pdfScale * 0.8, 0.25);
    updatePdfInfo();
    await renderPdfPages();
}

// PDF Fullscreen functions
function openPdfFullscreen() {
    if (!pdfDoc) return;

    pdfIsFullscreen = true;
    pdfFsTitle.textContent = pdfTitle.textContent || 'PDF';
    pdfFullscreenOverlay.style.display = "flex";

    updatePdfInfo();
    renderPdfPages();
}

function closePdfFullscreen() {
    if (richPdfFullscreen) {
        void closeRichPdfFullscreen();
        return;
    }
    pdfIsFullscreen = false;
    pdfFullscreenOverlay.style.display = "none";

    // Re-render in normal container
    updatePdfInfo();
    renderPdfPages();
}

// Image fullscreen functions
function openImageFullscreen() {
    imageFsPreview.src = imagePreview.src;
    imageFsTitle.textContent = imageTitle.textContent || 'Image';
    imageFullscreenOverlay.style.display = "flex";
}

function closeImageFullscreen() {
    imageFullscreenOverlay.style.display = "none";
}

// Open HTML file with editor + preview
let currentHtmlPath: string | null = null;

async function openHTML(path: string, generation: number): Promise<boolean> {
    return primaryDocumentRuntime.coordinateOpen({
        path,
        kind: "html",
        generation,
        load: async () => ({ snapshot: await FileService.ReadSnapshot(path), value: null }),
        commit: (document) => {
        currentHtmlPath = path;
        currentTextPath = null;
        currentNote = null;
        lastLoadedHtmlContent = document.snapshot.content;

        restoreOrRebaseDocumentHistory(document);
        htmlEditorTitle.textContent = path.split('/').pop() || 'HTML';
        htmlEditorContainer.style.display = "flex";
        updateHtmlPreview();
        updateFileTreeSelection(path);
        },
        fail: (error) => {
            console.error("Failed to open HTML:", error);
            alert(`Failed to open HTML: ${error}`);
        },
    });
}

async function openText(path: string, generation: number): Promise<boolean> {
    return primaryDocumentRuntime.coordinateOpen({
        path,
        kind: "text",
        generation,
        load: async () => ({ snapshot: await FileService.ReadSnapshot(path), value: null }),
        commit: (document) => {
        currentTextPath = path;
        currentNote = null;
        currentHtmlPath = null;
        lastLoadedMarkdownContent = "";
        lastLoadedTextContent = document.snapshot.content;

        editorContainer.style.display = "flex";
        restoreOrRebaseDocumentHistory(document);
        updatePaneTitles(path.split('/').pop() || path);
        updatePreview();
        clearBacklinks();
        clearOutgoingLinks();
        updateFileTreeSelection(path);
        },
        fail: (error) => {
            console.error("Failed to open text file:", error);
            alert(`Failed to open text file: ${error}`);
        },
    });
}

// Update HTML preview
function updateHtmlPreview() {
    const surface = activeRichSurface();
    if (surface) {
        surface.htmlPreview.srcdoc = surface.htmlEditor.value;
        return;
    }
    syncLineNumberGutters();
    const content = htmlEditor.value;
    const doc = htmlPreview.contentDocument || htmlPreview.contentWindow?.document;
    if (doc) {
        doc.open();
        doc.write(content);
        doc.close();
        injectHtmlPreviewReadabilityStyles(doc);
    }
}

function injectHtmlPreviewReadabilityStyles(doc: Document) {
    const style = doc.createElement("style");
    style.id = "obails-html-preview-readability";
    style.textContent = `
pre code,
pre code span,
pre code .line {
    color: #334155 !important;
    opacity: 1 !important;
}

pre code .hljs-comment,
pre code .hljs-quote,
pre code .token.comment,
pre code .token.prolog,
pre code .token.doctype,
pre code .token.cdata {
    color: #64748b !important;
}

pre code .hljs-keyword,
pre code .hljs-selector-tag,
pre code .token.keyword,
pre code .token.operator,
pre code .token.atrule {
    color: #dc2626 !important;
}

pre code .hljs-string,
pre code .hljs-doctag,
pre code .token.string,
pre code .token.char,
pre code .token.attr-value {
    color: #0369a1 !important;
}

pre code .hljs-title,
pre code .hljs-section,
pre code .token.function,
pre code .token.class-name {
    color: #7c3aed !important;
}

pre code .hljs-attr,
pre code .hljs-attribute,
pre code .hljs-name,
pre code .token.property,
pre code .token.attr-name,
pre code .token.variable {
    color: #0f766e !important;
}

pre code .hljs-number,
pre code .hljs-literal,
pre code .token.number,
pre code .token.boolean,
pre code .token.constant {
    color: #1d4ed8 !important;
}
`;

    const head = doc.head || doc.documentElement;
    head.appendChild(style);
}

const EDITOR_SAVE_DELAY_MS = 500;
let saveScheduler = primaryDocumentRuntime.saveScheduler;

function documentHistoryIdentity(document: EditableDocument): DocumentIdentity {
    return { path: document.snapshot.path, kind: document.kind };
}

function documentHistoryEditor(document: EditableDocument): HTMLTextAreaElement {
    return document.kind === "html" ? activeHtmlEditorElement() : activeEditorElement();
}

function readDocumentHistorySnapshot(document: EditableDocument): DocumentSnapshot {
    const target = documentHistoryEditor(document);
    return {
        content: target.value,
        selectionStart: target.selectionStart,
        selectionEnd: target.selectionEnd,
        scrollTop: target.scrollTop,
    };
}

function restoreOrRebaseDocumentHistory(document: EditableDocument) {
    const identity = documentHistoryIdentity(document);
    const target = documentHistoryEditor(document);
    const previous = documentHistory.current(identity);
    const snapshot = previous?.content === document.snapshot.content
        ? previous
        : {
            content: document.snapshot.content,
            selectionStart: 0,
            selectionEnd: 0,
            scrollTop: 0,
        };
    if (!previous || previous.content !== document.snapshot.content) {
        documentHistory.rebase(identity, snapshot);
    }
    target.value = snapshot.content;
    target.selectionStart = Math.min(snapshot.selectionStart, snapshot.content.length);
    target.selectionEnd = Math.min(snapshot.selectionEnd, snapshot.content.length);
    target.scrollTop = snapshot.scrollTop;
}

function restoreOrRebaseRichDocumentHistory(runtime: PrimaryDocumentRuntime, surface: RichSurface, document: EditableDocument) {
    const identity = { path: document.snapshot.path, kind: document.kind };
    const target = document.kind === "html" ? surface.htmlEditor : surface.editor;
    const previous = runtime.history.current(identity);
    const snapshot = previous?.content === document.snapshot.content
        ? previous
        : {
            content: document.snapshot.content,
            selectionStart: 0,
            selectionEnd: 0,
            scrollTop: 0,
        };
    if (!previous || previous.content !== document.snapshot.content) {
        runtime.history.rebase(identity, snapshot);
    }
    target.value = snapshot.content;
    target.selectionStart = Math.min(snapshot.selectionStart, snapshot.content.length);
    target.selectionEnd = Math.min(snapshot.selectionEnd, snapshot.content.length);
    target.scrollTop = snapshot.scrollTop;
}

function recordActiveDocumentEdit() {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document) {
        return;
    }
    documentHistory.recordEdit(documentHistoryIdentity(document), readDocumentHistorySnapshot(document));
}

function captureActiveDocumentView() {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document) {
        return;
    }
    const snapshot = readDocumentHistorySnapshot(document);
    documentHistory.updateCurrentView(documentHistoryIdentity(document), {
        selectionStart: snapshot.selectionStart,
        selectionEnd: snapshot.selectionEnd,
        scrollTop: snapshot.scrollTop,
    });
}

function canApplyDocumentHistory(): boolean {
    const document = primaryDocumentRuntime.activeEditableDocument;
    return Boolean(document && window.document.activeElement === documentHistoryEditor(document));
}

function applyDocumentHistory(direction: "undo" | "redo"): boolean {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document || window.document.activeElement !== documentHistoryEditor(document)) return false;
    const identity = documentHistoryIdentity(document);
    const snapshot = direction === "redo" ? documentHistory.redo(identity) : documentHistory.undo(identity);
    if (!snapshot) {
        return true;
    }
    const target = documentHistoryEditor(document);
    target.value = snapshot.content;
    target.selectionStart = Math.min(snapshot.selectionStart, snapshot.content.length);
    target.selectionEnd = Math.min(snapshot.selectionEnd, snapshot.content.length);
    target.scrollTop = snapshot.scrollTop;
    if (document.kind === "html") {
        updateHtmlPreview();
    } else {
        updatePreview();
    }
    scheduleSave(document, snapshot.content);
    return true;
}

function scheduleEditorSave() {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document || document.kind === "html") {
        return;
    }
    scheduleSave(document, activeEditorElement().value);
}

function scheduleHtmlSave() {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document || document.kind !== "html") {
        return;
    }
    scheduleSave(document, activeHtmlEditorElement().value);
}

function scheduleSave(document: EditableDocument, content: string) {
    if (document.failure === "conflict" || document.failure === "missing") {
        showSaveFailure(document.failure);
        return;
    }
    document.failure = null;
    documentRuntimeFactory.scheduleSave(activePaneId, captureSaveIntent(document, content), EDITOR_SAVE_DELAY_MS);
}

async function saveActiveDocumentNow() {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document) {
        return;
    }
    if (document.failure === "conflict" || document.failure === "missing") {
        showSaveFailure(document.failure);
        return;
    }
    document.failure = null;
    if (!await documentRuntimeFactory.saveNow(activePaneId, captureSaveIntent(document, editableContent(document)))) {
        if (document.failure) showSaveFailure(document.failure);
    }
}

async function retrySave() {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document || document.failure !== "error") {
        return;
    }
    document.failure = null;
    await saveActiveDocumentNow();
}

async function reloadExternalVersion() {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document || document.failure !== "conflict") {
        return;
    }
    documentRuntimeFactory.cancelSave(activePaneId, document);
    document.failure = null;
    clearSaveStatus();
    await openFile(document.snapshot.path, document.kind);
}

async function closeMissingDocument() {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document || document.failure !== "missing") {
        return;
    }
    documentRuntimeFactory.cancelSave(activePaneId, document);
    documentHistory.drop(documentHistoryIdentity(document));
    clearSaveStatus();
    clearCurrentSelection();
    await clearPersistedLastOpenedFile();
}

function editableContent(document: EditableDocument): string {
    return document.kind === "html" ? activeHtmlEditorElement().value : activeEditorElement().value;
}

async function saveCapturedIntent(paneId: string, runtime: PrimaryDocumentRuntime, intent: SaveIntent): Promise<void> {
    const document = intent.document;
    if (document.failure === "conflict" || document.failure === "missing") {
        return;
    }

    try {
        const result = await FileService.SaveIfUnchanged(intent.snapshot, intent.content);
        if (result.status === "saved" && result.snapshot) {
            document.snapshot = {
                path: result.snapshot.path,
                content: result.snapshot.content,
                revision: result.snapshot.revision,
            };
            document.failure = null;
            const canPublishLocal = documentRuntimeFactory.canPublishLocal(paneId, runtime, document.generation);
            const canPublishShared = documentRuntimeFactory.canPublishShared(paneId, runtime, document.generation, activePaneId);
            if (canPublishLocal) runtime.saveScheduler.updatePendingSnapshot(document, document.snapshot);
            if (canPublishLocal && runtime.activeEditableDocument === document) {
                clearPaneSaveFailure(paneId, runtime, document);
                const surface = richSurfaceForPane(paneId);
                if (surface) showSavePulse(surface.savePulse);
            }
            if (canPublishShared && runtime.activeEditableDocument === document) {
                updateSavedContent(document, result.snapshot.content);
                clearSaveStatus();
                if (!richSurfaceForPane(paneId)) showSavePulse();
            }
            if (document.kind === "markdown") {
                try {
                    await LinkService.RebuildIndex();
                    if (documentRuntimeFactory.canPublishLocal(paneId, runtime, document.generation)
                        && runtime.activeEditableDocument === document
                        && richSurfaceForPane(paneId)) {
                        await loadRichLinkPanels(paneId, runtime, document);
                    } else if (documentRuntimeFactory.canPublishShared(paneId, runtime, document.generation, activePaneId)
                        && runtime.activeEditableDocument === document
                        && isCurrentOpenGeneration(document.generation, runtime.openGeneration)) {
                        await loadLinkPanels(document.snapshot.path, document.generation);
                    }
                } catch (indexError) {
                    console.warn("Saved note but failed to rebuild link index:", indexError);
                }
            }
            void requestRecoverySnapshot();
            return;
        }
        if (result.status === "conflict" || result.status === "missing") {
            document.failure = result.status;
            if (documentRuntimeFactory.canPublishLocal(paneId, runtime, document.generation) && runtime.activeEditableDocument === document) {
                if (richSurfaceForPane(paneId)) {
                    renderRichSaveFailure(paneId, runtime, document, result.status);
                } else if (activePaneId === paneId) {
                    showSaveFailure(result.status);
                }
            }
            return;
        }
        throw new Error(`Unknown save result: ${result.status}`);
    } catch (err) {
        console.error("Failed to save file:", err);
        document.failure = "error";
        if (documentRuntimeFactory.canPublishLocal(paneId, runtime, document.generation) && runtime.activeEditableDocument === document) {
            if (richSurfaceForPane(paneId)) {
                renderRichSaveFailure(paneId, runtime, document, "error");
            } else if (activePaneId === paneId) {
                showSaveFailure("error");
            }
        }
    }
}

function updateSavedContent(document: EditableDocument, content: string) {
    if (document.kind === "markdown") {
        if (currentNote) {
            currentNote.content = content;
            currentNote.revision = document.snapshot.revision;
        }
        lastLoadedMarkdownContent = content;
        return;
    }
    if (document.kind === "html") {
        lastLoadedHtmlContent = content;
        return;
    }
    lastLoadedTextContent = content;
}

async function flushActiveDocumentBeforeSwitch(): Promise<boolean> {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document) {
        return true;
    }
    captureActiveDocumentView();
    if (!await documentRuntimeFactory.flushPane(activePaneId)) {
        if (document.failure) showSaveFailure(document.failure);
        return false;
    }
    if (document.failure) {
        showSaveFailure(document.failure);
        return false;
    }
    return true;
}

function showSaveFailure(failure: "conflict" | "missing" | "error") {
    const messages = {
        conflict: "保存を停止しました。ディスク上の内容が変更されています。編集内容は保持されています。",
        missing: "保存を停止しました。ファイルは外部で削除または移動されました。編集内容をコピーし、別のファイルに保存してから文書を閉じてください。",
        error: "保存に失敗しました。編集内容は保持されています。再試行できます。",
    };
    for (const status of [
        [saveStatus, saveStatusMessage, saveStatusRetry, saveStatusReload, saveStatusClose],
        [htmlSaveStatus, htmlSaveStatusMessage, htmlSaveStatusRetry, htmlSaveStatusReload, htmlSaveStatusClose],
    ] as const) {
        const [container, message, retry, reload, close] = status;
        message.textContent = messages[failure];
        container.hidden = false;
        retry.hidden = failure !== "error";
        reload.hidden = failure !== "conflict";
        close.hidden = failure !== "missing";
    }
}

function clearSaveStatus() {
    for (const status of [
        [saveStatus, saveStatusMessage, saveStatusRetry, saveStatusReload, saveStatusClose],
        [htmlSaveStatus, htmlSaveStatusMessage, htmlSaveStatusRetry, htmlSaveStatusReload, htmlSaveStatusClose],
    ] as const) {
        const [container, message, retry, reload, close] = status;
        container.hidden = true;
        message.textContent = "";
        retry.hidden = true;
        reload.hidden = true;
        close.hidden = true;
    }
}

function saveFailureMessage(failure: "conflict" | "missing" | "error"): string {
    return {
        conflict: "保存を停止しました。ディスク上の内容が変更されています。編集内容は保持されています。",
        missing: "保存を停止しました。ファイルは外部で削除または移動されました。編集内容をコピーし、別のファイルに保存してから文書を閉じてください。",
        error: "保存に失敗しました。編集内容は保持されています。再試行できます。",
    }[failure];
}

function clearRichSaveFailure(controls: SaveConflictControls) {
    controls.status.hidden = true;
    controls.message.textContent = "";
    controls.retryButton.hidden = true;
    controls.reloadButton.hidden = true;
    controls.closeButton.hidden = true;
    controls.retryButton.onclick = null;
    controls.reloadButton.onclick = null;
    controls.closeButton.onclick = null;
}

function richSaveConflictControls(surface: RichSurface, document: EditableDocument): SaveConflictControls {
    return document.kind === "html" ? surface.htmlSaveConflict : surface.markdownSaveConflict;
}

function renderRichSaveFailure(
    paneId: string,
    runtime: PrimaryDocumentRuntime,
    document: EditableDocument,
    failure: "conflict" | "missing" | "error",
) {
    const surface = richSurfaceForPane(paneId);
    if (!surface || runtime.activeEditableDocument !== document) return;
    const controls = richSaveConflictControls(surface, document);
    controls.message.textContent = saveFailureMessage(failure);
    controls.status.hidden = false;
    controls.retryButton.hidden = failure !== "error";
    controls.reloadButton.hidden = failure !== "conflict";
    controls.closeButton.hidden = failure !== "missing";
    controls.retryButton.onclick = () => void retryRichDocumentSave(paneId, runtime, document);
    controls.reloadButton.onclick = () => void reloadRichDocument(paneId, runtime, document);
    controls.closeButton.onclick = () => void closeMissingRichDocument(paneId, runtime, document);
}

function clearPaneSaveFailure(paneId: string, runtime: PrimaryDocumentRuntime, document: EditableDocument) {
    const surface = richSurfaceForPane(paneId);
    if (!surface || runtime.activeEditableDocument !== document) return;
    clearRichSaveFailure(richSaveConflictControls(surface, document));
}

async function retryRichDocumentSave(paneId: string, runtime: PrimaryDocumentRuntime, document: EditableDocument) {
    if (runtime.activeEditableDocument !== document || document.failure !== "error") return;
    const surface = richSurfaceForPane(paneId);
    if (!surface) return;
    document.failure = null;
    const content = document.kind === "html" ? surface.htmlEditor.value : surface.editor.value;
    await documentRuntimeFactory.saveNow(paneId, captureSaveIntent(document, content));
    if (document.failure) renderRichSaveFailure(paneId, runtime, document, document.failure);
}

async function reloadRichDocument(paneId: string, runtime: PrimaryDocumentRuntime, document: EditableDocument) {
    if (runtime.activeEditableDocument !== document || document.failure !== "conflict") return;
    documentRuntimeFactory.cancelSave(paneId, document);
    document.failure = null;
    clearPaneSaveFailure(paneId, runtime, document);
    await openRichSurfaceFile(document.snapshot.path, document.kind, paneId);
}

async function closeMissingRichDocument(paneId: string, runtime: PrimaryDocumentRuntime, document: EditableDocument) {
    if (runtime.activeEditableDocument !== document || document.failure !== "missing") return;
    if (popoutRoute && paneId !== popoutRoute.paneId) return;
    let snapshot: WorkspaceStateSnapshot | null;
    try {
        snapshot = popoutRoute
            ? await workspaceController.closeMissingTabInRoutedPopout(paneId, popoutRoute.popoutId, document.snapshot.path, runtime, document)
            : await workspaceController.closeMissingTab(paneId, document.snapshot.path, runtime, document);
    } catch (error) {
        announceOperation(`Could not close the missing document: ${describeOperationError(error)}.`);
        return;
    }
    if (!snapshot || paneTabsFor(snapshot, paneId)?.tabs.some((tab) => tab.path === document.snapshot.path)) return;
    runtime.history.drop({ path: document.snapshot.path, kind: document.kind });
    clearPaneSaveFailure(paneId, runtime, document);
    runtime.clearActiveDocument();
    if (paneId === activePaneId) await openActiveWorkspaceTab(snapshot);
}

// 保存の気配: 「保存しました」とは言わず、タイトル横の小さな点がふっと現れて消える
const savePulseTimers = new WeakMap<HTMLElement, number>();
function showSavePulse(pulse: HTMLElement | null = document.getElementById("save-pulse")) {
    if (!pulse) return;

    pulse.classList.remove("visible");
    // 連続保存でもアニメーションを最初からやり直すための reflow
    void (pulse as HTMLElement).offsetWidth;
    pulse.classList.add("visible");

    const timerId = savePulseTimers.get(pulse);
    if (timerId !== undefined) {
        window.clearTimeout(timerId);
    }
    savePulseTimers.set(pulse, window.setTimeout(() => {
        pulse.classList.remove("visible");
        savePulseTimers.delete(pulse);
    }, 1200));
}

// Open file with system default app
async function openExternal(path: string): Promise<void> {
    try {
        await FileService.OpenExternal(path);
    } catch (err) {
        console.error("Failed to open external:", err);
        alert(`Failed to open file: ${err}`);
    }
}

// Get MIME type from extension
function getMimeTypeFromExt(ext: string): string {
    const mimeTypes: { [key: string]: string } = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        bmp: "image/bmp",
        ico: "image/x-icon",
        mp3: "audio/mpeg",
        m4a: "audio/mp4",
        wav: "audio/wav",
        ogg: "audio/ogg",
        flac: "audio/flac",
        aac: "audio/aac",
        opus: "audio/ogg",
    };
    return mimeTypes[ext] || "application/octet-stream";
}

// Update file tree selection highlight
type FileTreeSelectionOptions = {
    reveal?: boolean;
};

function updateFileTreeSelection(path: string, options: FileTreeSelectionOptions = {}) {
    // Remove previous selection
    document.querySelectorAll(".file-item").forEach(el => el.classList.remove("active"));

    // Expand parent folders to reveal the file.
    // Watcher-driven refreshes pass { reveal: false } so user-collapsed folders stay closed.
    if (options.reveal !== false && fileTreeAutoReveal) {
        expandParentFolders(path);
    }

    // Highlight the file
    const fileItem = findFileTreeElement(path);
    if (fileItem) {
        fileItem.classList.add("active");
        // Delay scroll to ensure folder expansion is complete
        setTimeout(() => {
            if (!isContextMenuVisible()) {
                fileItem.scrollIntoView({ behavior: "auto", block: "nearest" });
            }
        }, 50);
    }
}

function handleFileTreeItemSelection(event: MouseEvent, path: string): boolean {
    const outcome = nextFileTreeSelection(
        selectedFilePaths,
        fileTreeSelectionAnchor,
        path,
        getVisibleFileItems().map((item) => item.dataset.path || "").filter(Boolean),
        event.metaKey || event.ctrlKey || event.altKey,
        event.shiftKey,
    );
    selectedFilePaths = outcome.selected;
    fileTreeSelectionAnchor = outcome.anchorPath;
    syncFileTreeMultiSelection();
    return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}

function syncFileTreeMultiSelection() {
    fileTree.querySelectorAll<HTMLElement>(".file-item").forEach((item) => {
        const selected = selectedFilePaths.has(item.dataset.path || "");
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-selected", selected ? "true" : "false");
    });
}

// Expand all parent folders for a given file path
function expandParentFolders(path: string) {
    const parts = path.split("/");
    let currentPath = "";

    // Iterate through path parts (excluding the file itself)
    for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];

        const folderItem = findFileTreeElement(currentPath, true);
        if (folderItem && !folderItem.classList.contains("expanded")) {
            // Expand the folder
            setFolderExpanded(folderItem as HTMLElement, true);
        }
    }
}

// File Tree
async function loadFileTree(options: FileTreeSnapshotOptions = {}) {
    try {
        const files = normalizeAndSortFileTree(await FileService.ListDirectoryTree(), fileTreeSort);
        applyFileTreeSnapshot(files, options);
        fileTreeStatus.textContent = "";
        fileTreeRetry.hidden = true;
    } catch (err) {
        console.error("Failed to load file tree:", err);
        fileTree.replaceChildren();
        fileTreeStatus.textContent = `Could not load files: ${describeOperationError(err)}. Retry loading files.`;
        fileTreeRetry.hidden = false;
        emptyVaultActions.hidden = true;
    }
}

function renderFileTree(files: FileInfo[]) {
    fileTree.replaceChildren();
    emptyVaultActions.hidden = files.length !== 0;
    if (files.length === 0) return;

    for (const file of files) {
        const el = createFileElement(file, 1);
        fileTree.appendChild(el);
    }
}

function createFileElement(file: FileInfo, level: number): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "file-wrapper";

    const el = document.createElement("div");
    el.className = `file-item ${file.isDir ? "folder" : "file"}`;
    el.setAttribute("data-path", file.path);
    el.setAttribute("data-name", file.name);
    el.setAttribute("role", "treeitem");
    const accessibility = describeTreeItem(file.name, file.isDir, level);
    el.setAttribute("aria-level", String(accessibility.level));
    el.setAttribute("aria-label", accessibility.label);
    if (accessibility.expanded) {
        el.setAttribute("aria-expanded", accessibility.expanded);
    }
    el.tabIndex = -1;
    el.setAttribute("aria-selected", selectedFilePaths.has(file.path) ? "true" : "false");
    el.classList.toggle("selected", selectedFilePaths.has(file.path));
    if (file.isDir) {
        el.setAttribute("data-file-drop-target", "");
    }

    const icon = getFileIcon(file);
    appendFileTreeItemContent(
        el,
        icon,
        file.path,
        file.isDir ? "folder" : "file",
        !file.isDir && resolveFileType(file.fileType || "", file.path) === "audio",
    );

    if (file.isDir) {
        const noteCount = document.createElement("span");
        noteCount.className = "folder-note-count";
        noteCount.textContent = String(countMarkdownNotes(file));
        el.appendChild(noteCount);
    }

    el.addEventListener("focus", () => {
        fileTreeFocused = true;
        fileTree.classList.add("keyboard-focused");
        const index = getVisibleFileItems().indexOf(el);
        if (index >= 0) updateKeyboardSelection(index, false);
    });

    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
        draggedFilePaths = selectedFilePaths.has(file.path) ? Array.from(selectedFilePaths) : [file.path];
        el.classList.add("dragging");
        e.dataTransfer?.setData("text/plain", draggedFilePaths.join("\n"));
    });
    el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        draggedFilePaths = [];
        document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
    });

    wrapper.appendChild(el);

    if (file.isDir) {
        let childrenEl: HTMLElement | null = null;

        if (file.children && file.children.length > 0) {
            childrenEl = document.createElement("div");
            childrenEl.className = "folder-children";
            childrenEl.style.display = "none";
            for (const child of file.children) {
                childrenEl.appendChild(createFileElement(child, level + 1));
            }
            wrapper.appendChild(childrenEl);
        }

        el.addEventListener("click", (e) => {
            if (handleFileTreeItemSelection(e, file.path)) {
                return;
            }
            if (shouldIgnoreTreeClick(
                e.button,
                e.ctrlKey,
                e.metaKey,
                file.path,
                suppressFileTreeClickPath,
                suppressFileTreeClickUntil,
                Date.now(),
            )) {
                return;
            }
            e.stopPropagation();
            const expanded = !el.classList.contains("expanded");
            setFolderExpanded(el, expanded);
        });

        // Right-click context menu for folders
        el.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.focus();
            suppressFileTreeClickPath = file.path;
            suppressFileTreeClickUntil = Date.now() + 300;
            showContextMenu(e.clientX, e.clientY, file.path, true);
        });

        // Drop target for drag & drop
        el.addEventListener("dragover", (e) => {
            if (draggedFilePaths.length === 0 && !hasExternalFileDrop(e.dataTransfer)) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            el.classList.add("drag-over");
        });
        el.addEventListener("dragleave", () => {
            el.classList.remove("drag-over");
        });
        el.addEventListener("drop", async (e) => {
            el.classList.remove("drag-over");
            if (draggedFilePaths.some((path) => path === file.path || file.path.startsWith(`${path}/`))) {
                return;
            }
            await handleFileTreeDrop(e, file.path);
        });
    } else {
        // Handle file click based on file type
        el.addEventListener("click", (e) => {
            if (handleFileTreeItemSelection(e, file.path)) {
                return;
            }
            if (shouldIgnoreTreeClick(
                e.button,
                e.ctrlKey,
                e.metaKey,
                file.path,
                suppressFileTreeClickPath,
                suppressFileTreeClickUntil,
                Date.now(),
            )) {
                return;
            }
            e.stopPropagation();
            openFile(file.path, file.fileType || "other");
        });

        // Right-click context menu for files
        el.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.focus();
            suppressFileTreeClickPath = file.path;
            suppressFileTreeClickUntil = Date.now() + 300;
            showContextMenu(e.clientX, e.clientY, file.path, false);
        });
    }

    return wrapper;
}

// Note Operations
async function openNote(path: string, requestedGeneration?: number): Promise<boolean> {
    if (requestedGeneration === undefined && !await flushActiveDocumentBeforeSwitch()) {
        return false;
    }
    const paneId = activePaneId;
    const runtime = primaryDocumentRuntime;
    const generation = requestedGeneration ?? runtime.beginOpen();
    showTimeline = false;
    hideAllViewers();
    editorContainer.style.display = "flex";

    return runtime.coordinateOpen({
        path,
        kind: "markdown",
        generation,
        load: async () => {
            const [snapshot, note] = await Promise.all([
            FileService.ReadSnapshot(path),
            NoteService.GetNote(path),
            ]);
            if (!note) throw new Error(`note not found: ${path}`);
            return { snapshot, value: note };
        },
        commit: (document, note) => {
        currentNote = note;
        currentNote.content = document.snapshot.content;
        currentNote.revision = document.snapshot.revision;

        currentTextPath = null;
        currentHtmlPath = null;
        lastLoadedTextContent = "";
        lastLoadedMarkdownContent = document.snapshot.content;
        updatePaneSidebarContent(paneId, document.snapshot.path, document.snapshot.content);
        restoreOrRebaseDocumentHistory(document);
        syncMarkdownAttachmentDropTarget();
        updatePreview();
        renderActiveSharedSidebar();
        },
        afterCommit: async (_document, _note, isCurrent) => {
        await loadLinkPanels(path, generation);
        if (!isCurrent()) return;
        updatePaneTitles(getDisplayName(path, "file"));
        updateFileTreeSelection(path);
        recordRecentQuickSwitcherPath(path);
        if (requestedGeneration === undefined) {
            void persistLastOpenedFile(path, "markdown", paneId, runtime, generation);
        }
        },
        fail: (error) => {
            console.error("Failed to open note:", error);
            announceOperation(`Could not open ${path}: ${describeOperationError(error)}.`);
            showEmptyMainPane();
        },
    });
}

// Update editor and preview pane titles
function updatePaneTitles(title: string) {
    const surface = activeRichSurface();
    if (surface) {
        surface.editorTitle.textContent = title;
        surface.editorTitle.setAttribute("aria-label", `Rename ${title}`);
        return;
    }
    const editorTitle = document.getElementById("editor-title");
    const previewTitle = document.getElementById("preview-title");
    if (editorTitle) {
        editorTitle.textContent = title;
        editorTitle.setAttribute("aria-label", `Rename ${title}`);
    }
    if (previewTitle) previewTitle.textContent = "Preview";
}

async function updateCurrentPathsAfterMove(previousPath: string, nextPath: string, isDir: boolean) {
    const rewritePath = (path: string | null): string | null =>
        rewritePathAfterMove(path, previousPath, nextPath, isDir);

    for (const paneId of documentRuntimeFactory.paneIds()) {
        documentRuntimeFactory.forPane(paneId).rewritePathIdentity(previousPath, nextPath, isDir);
    }
    currentHtmlPath = rewritePath(currentHtmlPath);
    currentTextPath = rewritePath(currentTextPath);
    currentAudioPath = rewritePath(currentAudioPath);
    if (currentNote?.path) {
        currentNote.path = rewritePath(currentNote.path) || currentNote.path;
    }
    for (const [paneId, cache] of paneSidebarStates) {
        paneSidebarStates.set(paneId, rewritePaneSidebarCachePath(cache, previousPath, nextPath, isDir));
    }
    for (const [paneId, state] of paneViewStates) {
        paneViewStates.set(paneId, {
            ...state,
            note: state.note?.path
                ? { ...state.note, path: rewritePath(state.note.path) || state.note.path }
                : state.note,
            audioPath: rewritePath(state.audioPath),
            htmlPath: rewritePath(state.htmlPath),
            textPath: rewritePath(state.textPath),
        });
    }

    if (primaryDocumentRuntime.currentFilePath) {
        const fileType = getFileTypeFromPath(primaryDocumentRuntime.currentFilePath);
        lastSyncedOpenedFile = toStateKey(primaryDocumentRuntime.currentFilePath, fileType);
        void StateService.SetLastOpenedFile(primaryDocumentRuntime.currentFilePath, fileType).catch((err) => {
            console.warn("Failed to persist moved path:", err);
        });
        if (fileType === "markdown") {
            updatePaneTitles(getDisplayName(primaryDocumentRuntime.currentFilePath, "file"));
        } else if (fileType === "html") {
            htmlEditorTitle.textContent = primaryDocumentRuntime.currentFilePath.split("/").pop() || "HTML";
        }
    }
    if (currentAudioPath) {
        miniPlayerTitle.textContent = currentAudioPath.split("/").pop() || "Audio";
    }
    syncMarkdownAttachmentDropTarget();
    try {
        await workspaceController.rewriteTabsAfterMove(previousPath, nextPath, isDir);
    } catch (error) {
        announceOperation(`Could not update workspace tabs after rename: ${describeOperationError(error)}.`);
        throw error;
    }
}

function clearCurrentSelection() {
    hideAllViewers();
    editorContainer.style.display = "flex";
    currentNote = null;
    primaryDocumentRuntime.currentFilePath = null;
    primaryDocumentRuntime.activeEditableDocument = null;
    currentHtmlPath = null;
    currentTextPath = null;
    lastLoadedMarkdownContent = "";
    lastLoadedHtmlContent = "";
    lastLoadedTextContent = "";
    lastSyncedOpenedFile = "";
    syncMarkdownAttachmentDropTarget();
    editor.value = "";
    editor.selectionStart = 0;
    editor.selectionEnd = 0;
    editor.scrollTop = 0;
    updatePreview();
    clearBacklinks();
    clearOutgoingLinks();
    updatePaneTitles("Select a note...");
}

function syncMarkdownAttachmentDropTarget() {
    const target = activeEditorElement();
    if (primaryDocumentRuntime.activeEditableDocument?.kind === "markdown" && primaryDocumentRuntime.currentFilePath === primaryDocumentRuntime.activeEditableDocument.snapshot.path) {
        target.dataset.notePath = primaryDocumentRuntime.activeEditableDocument.snapshot.path;
        return;
    }
    delete target.dataset.notePath;
}

async function syncOpenFileWithVault() {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document) {
        return;
    }
    if (editableContent(document) !== document.snapshot.content) {
        return;
    }

    try {
        const snapshot = await FileService.ReadSnapshot(document.snapshot.path);
        if (primaryDocumentRuntime.activeEditableDocument !== document || !isCurrentOpenGeneration(document.generation, primaryDocumentRuntime.openGeneration)) {
            return;
        }
        if (snapshot.revision === document.snapshot.revision) {
            return;
        }

        const previousView = document.kind === "html" ? null : getEditorViewState();
        document.snapshot = snapshot;
        if (document.kind === "html") {
            activeHtmlEditorElement().value = snapshot.content;
            lastLoadedHtmlContent = snapshot.content;
            documentHistory.reset(documentHistoryIdentity(document), readDocumentHistorySnapshot(document));
            updateHtmlPreview();
            return;
        }

        activeEditorElement().value = snapshot.content;
        updateSavedContent(document, snapshot.content);
        if (previousView) {
            restoreEditorViewState(previousView);
        }
        documentHistory.reset(documentHistoryIdentity(document), readDocumentHistorySnapshot(document));
        updatePreview();
        if (document.kind === "markdown" && currentNote) {
            currentNote.content = snapshot.content;
            currentNote.revision = snapshot.revision;
            await loadLinkPanels(snapshot.path, document.generation);
            if (primaryDocumentRuntime.activeEditableDocument !== document || !isCurrentOpenGeneration(document.generation, primaryDocumentRuntime.openGeneration)) {
                return;
            }
            updatePaneTitles(getDisplayName(snapshot.path, "file"));
        }
        updateFileTreeSelection(snapshot.path, { reveal: false });
    } catch (err) {
        console.warn("Failed to refresh open file from vault:", err);
        if (primaryDocumentRuntime.activeEditableDocument !== document) {
            return;
        }
        const exists = await FileService.FileExists(document.snapshot.path).catch(() => true);
        if (primaryDocumentRuntime.activeEditableDocument !== document) {
            return;
        }
        if (!exists) {
            documentRuntimeFactory.cancelSave(activePaneId, document);
            if (editableContent(document) === document.snapshot.content) {
                documentHistory.drop(documentHistoryIdentity(document));
                clearCurrentSelection();
                await clearPersistedLastOpenedFile();
                return;
            }
            document.failure = "missing";
            showSaveFailure("missing");
            return;
        }
        document.failure = "error";
        showSaveFailure("error");
    }
}

function getEditorViewState() {
    const target = activeEditorElement();
    return {
        selectionStart: target.selectionStart,
        selectionEnd: target.selectionEnd,
        scrollTop: target.scrollTop,
    };
}

function restoreEditorViewState(previousView: ReturnType<typeof getEditorViewState>) {
    const target = activeEditorElement();
    const maxScrollTop = Math.max(0, target.scrollHeight - target.clientHeight);
    const nextView = clampEditorViewState(previousView, target.value.length, maxScrollTop);
    target.selectionStart = nextView.selectionStart;
    target.selectionEnd = nextView.selectionEnd;
    target.scrollTop = nextView.scrollTop;
}

async function openTodayNote() {
    showTimeline = false;
    hideAllViewers();
    editorContainer.style.display = "flex";

    try {
        const note = await NoteService.GetTodayDailyNote();
        if (note) {
            await openFile(note.path, "markdown");
        }
    } catch (err) {
        console.error("Failed to open today's note:", err);
    }
}

// Preview
function renderRichPreview(surface: RichSurface, runtime: PrimaryDocumentRuntime, document: EditableDocument) {
    surface.preview.innerHTML = parseMarkdown(surface.editor.value);
    enhanceRichPreview(surface, runtime, document);
}

function enhanceRichPreview(surface: RichSurface, runtime: PrimaryDocumentRuntime, document: EditableDocument) {
    enhancePreviewInternalLinks(surface.preview);
    surface.preview.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
    });
    enhanceCodeBlocks(surface.preview);
    window.setTimeout(() => void initMermaidDiagrams(surface.preview), 100);
    void resolvePreviewEmbedsForRichSurface(surface, runtime, document);
    void refreshPreviewInternalLinkStates(surface.preview, runtime, document.generation);
}

function updatePreview() {
    const surface = activeRichSurface();
    if (surface) {
        const content = surface.editor.value;
        const document = primaryDocumentRuntime.activeEditableDocument;
        if (document?.kind === "markdown") {
            renderRichPreview(surface, primaryDocumentRuntime, document);
        } else {
            surface.preview.innerHTML = `<pre class="plain-text-preview">${escapeHtml(content)}</pre>`;
        }
        return;
    }
    syncLineNumberGutters();
    const content = editor.value;
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (document?.kind === "markdown") updatePaneSidebarContent(activePaneId, document.snapshot.path, content);
    const renderGeneration = ++previewEmbedRenderGeneration;
    if (currentTextPath) {
        preview.innerHTML = `<pre class="plain-text-preview">${escapeHtml(content)}</pre>`;
        outlineList.innerHTML = '<div class="outline-empty">Headings you write will gather here</div>';
        refreshNoteSearchHighlights();
        return;
    }

    preview.innerHTML = parseMarkdown(content);
    enhancePreviewInternalLinks();
    // Syntax highlighting for code blocks
    preview.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
    });
    enhanceCodeBlocks();
    // Initialize mermaid diagrams after rendering
    setTimeout(() => initMermaidDiagrams(), 100);
    // Update outline
    updateOutline(content);
    renderActiveSharedSidebar();
    // Resolve only embeds accepted by the current link-index generation.
    void resolvePreviewEmbeds(renderGeneration);
    void refreshPreviewInternalLinkStates();
    refreshNoteSearchHighlights();
}

function previewEmbedSource(element: HTMLElement): string {
    if (element.classList.contains("wiki-link")) {
        return element.getAttribute("data-link") || "";
    }
    return element.getAttribute("data-vault-path") || element.getAttribute("src") || "";
}

function previewEmbedKind(element: HTMLElement): "wikilink" | "markdown" {
    return element.dataset.embedLink === "wikilink" ? "wikilink" : "markdown";
}

function findStructuredPreviewEmbed(links: Link[], element: HTMLElement): Link | undefined {
    const target = parseInternalLinkTarget(previewEmbedSource(element));
    return links.find((link) => link.isEmbed
        && link.kind === previewEmbedKind(element)
        && link.text === target.target
        && (link.fragment || "") === target.fragment
        && (link.fragmentType || "") === (target.fragmentType || ""));
}

function showPreviewEmbedFailure(source: HTMLElement, message: string) {
    const failure = document.createElement("span");
    failure.className = "preview-embed-failure";
    failure.setAttribute("role", "status");
    failure.textContent = message;
    source.replaceWith(failure);
}

function renderSanitizedMarkdown(content: string): DocumentFragment {
    return sanitizeEmbedHtml(parseMarkdown(content));
}

function renderInlineAudioEmbed(link: Link): HTMLElement {
    const audio = document.createElement("audio");
    audio.className = "preview-embed-audio";
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = `/media/audio?path=${encodeURIComponent(link.targetPath)}`;
    audio.addEventListener("error", () => {
        audio.replaceWith(createPreviewEmbedFailure("Audio embed could not be loaded."));
    }, { once: true });
    return audio;
}

function createPreviewEmbedFailure(message: string): HTMLElement {
    const failure = document.createElement("span");
    failure.className = "preview-embed-failure";
    failure.setAttribute("role", "status");
    failure.textContent = message;
    return failure;
}

async function renderInlinePdfEmbed(link: Link): Promise<HTMLElement> {
    const base64Data = await FileService.ReadBinaryFile(link.targetPath);
    const frame = document.createElement("iframe");
    frame.className = "preview-embed-pdf";
    frame.title = link.alias || link.targetPath;
    frame.setAttribute("sandbox", "");
    frame.src = `data:application/pdf;base64,${base64Data}`;
    return frame;
}

function resolvePreviewEmbedsForRichSurface(
    surface: RichSurface,
    runtime: PrimaryDocumentRuntime,
    document: EditableDocument,
) {
    const renderGeneration = (richPreviewEmbedRenderGenerations.get(surface.preview) || 0) + 1;
    richPreviewEmbedRenderGenerations.set(surface.preview, renderGeneration);
    return resolvePreviewEmbeds(renderGeneration, surface.preview, runtime, document.generation);
}

async function resolvePreviewEmbeds(
    renderGeneration: number,
    previewTarget: HTMLElement = preview,
    runtime: PrimaryDocumentRuntime = primaryDocumentRuntime,
    expectedGeneration = runtime.openGeneration,
) {
    const isLegacyPreview = previewTarget === preview;
    const sourcePath = runtime.currentFilePath;
    const isCurrent = () => (isLegacyPreview
        ? renderGeneration === previewEmbedRenderGeneration && runtime === primaryDocumentRuntime
        : richPreviewEmbedRenderGenerations.get(previewTarget) === renderGeneration)
        && sourcePath === runtime.currentFilePath
        && expectedGeneration === runtime.openGeneration;
    const candidates = Array.from(previewTarget.querySelectorAll<HTMLElement>("[data-embed-link], img[src]"));
    if (!sourcePath || candidates.length === 0) {
        void resolvePreviewImages(previewTarget, sourcePath);
        return;
    }

    try {
        const state = await LinkService.GetIndexState();
        if (!isCurrent()) {
            return;
        }
        if (!state.ready) {
            candidates.filter((candidate) => candidate.dataset.embedLink).forEach((candidate) => {
                showPreviewEmbedFailure(candidate, "Embed is waiting for the link index.");
            });
            return;
        }

        const links = await LinkService.GetLinkInfo(sourcePath);
        if (!isCurrent()) {
            return;
        }

        for (const candidate of candidates) {
            if (!candidate.isConnected) continue;
            const link = findStructuredPreviewEmbed(links, candidate);
            if (!link) {
                if (candidate.dataset.embedLink) {
                    showPreviewEmbedFailure(candidate, "Embed is not available in the current link index.");
                }
                continue;
            }

            const kind = getPreviewEmbedKind(link);
            if (!kind) {
                showPreviewEmbedFailure(candidate, "Embed target is unavailable.");
                continue;
            }

            if (kind === "image") {
                const image = candidate as HTMLImageElement;
                const dimensions = getImageEmbedDimensions(link);
                if (dimensions.width) image.setAttribute("width", dimensions.width);
                if (dimensions.height) image.setAttribute("height", dimensions.height);
                continue;
            }

            if (kind === "audio") {
                candidate.replaceWith(renderInlineAudioEmbed(link));
                continue;
            }

            try {
                if (kind === "pdf") {
                    candidate.replaceWith(await renderInlinePdfEmbed(link));
                    continue;
                }

                const result = await TransclusionService.Resolve(link);
                if (!isCurrent()) {
                    return;
                }
                if (result.generation !== link.generation || result.targetPath !== link.targetPath) {
                    showPreviewEmbedFailure(candidate, "Embed was rejected because the link index changed.");
                    continue;
                }
                const embed = document.createElement("section");
                embed.className = "note-embed";
                const title = document.createElement("button");
                title.type = "button";
                title.className = "note-embed-title";
                title.textContent = link.alias || result.targetPath;
                title.addEventListener("click", () => {
                    const paneId = previewTarget.closest<HTMLElement>("[data-pane-id]")?.dataset.paneId;
                    if (paneId) {
                        void activateWorkspacePaneFromUi(paneId).then(() => openFile(link.targetPath, "markdown"));
                        return;
                    }
                    void openFile(link.targetPath, "markdown");
                });
                const body = document.createElement("div");
                body.className = "note-embed-content";
                body.appendChild(renderSanitizedMarkdown(result.content));
                embed.append(title, body);
                candidate.replaceWith(embed);
            } catch (err) {
                console.warn("Failed to resolve preview embed:", err);
                showPreviewEmbedFailure(candidate, "Embed was rejected by the current link index.");
            }
        }
        enhancePreviewInternalLinks(previewTarget);
        enhanceCodeBlocks(previewTarget);
        void resolvePreviewImages(previewTarget, sourcePath);
    } catch (err) {
        console.warn("Failed to resolve preview embeds:", err);
        candidates.filter((candidate) => candidate.dataset.embedLink).forEach((candidate) => {
            if (candidate.isConnected) showPreviewEmbedFailure(candidate, "Embed could not be resolved safely.");
        });
    }
}

async function resolvePreviewImages(previewTarget: HTMLElement = preview, notePath = primaryDocumentRuntime.currentFilePath || "") {
    const images = previewTarget.querySelectorAll<HTMLImageElement>("img");
    for (const img of images) {
        const src = img.getAttribute("src") || "";
        const vaultPath = img.getAttribute("data-vault-path") || "";
        const imagePath = vaultPath || src;

        // Skip external URLs and data URIs
        if (!imagePath || /^(https?:|data:)/i.test(imagePath)) {
            continue;
        }

        try {
            const resolvedPath = await FileService.ResolveImagePath(imagePath, notePath);
            const base64Data = await FileService.ReadBinaryFile(resolvedPath);
            const ext = resolvedPath.split(".").pop()?.toLowerCase() || "png";
            const mimeType = getMimeTypeFromExt(ext);
            img.src = `data:${mimeType};base64,${base64Data}`;
        } catch {
            img.alt = `[Image not found: ${imagePath}]`;
            img.style.opacity = "0.5";
        }
    }
}

function setupPreviewInteractions(previewTarget: HTMLElement = preview, activatePane: () => Promise<void> = async () => {}) {
    previewTarget.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;

        const image = target.closest("img") as HTMLImageElement | null;
        if (image && previewTarget.contains(image)) {
            e.preventDefault();
            e.stopPropagation();
            openPreviewImageLightbox(image);
            return;
        }

        const wikiLink = target.closest(".wiki-link") as HTMLElement | null;
        if (wikiLink && previewTarget.contains(wikiLink)) {
            e.preventDefault();
            e.stopPropagation();
            void activatePane().then(() => openInternalPreviewLink(wikiLink.getAttribute("data-link") || "", wikiLink));
            return;
        }

        const markdownLink = target.closest("a") as HTMLAnchorElement | null;
        if (markdownLink && previewTarget.contains(markdownLink) && isInternalPreviewLink(markdownLink)) {
            e.preventDefault();
            e.stopPropagation();
            void activatePane().then(() => openInternalPreviewLink(markdownLink.getAttribute("href") || "", markdownLink));
        }
    });

    previewTarget.addEventListener("keydown", (event) => {
        const wikiLink = (event.target as HTMLElement).closest(".wiki-link") as HTMLElement | null;
        if (!wikiLink || !previewTarget.contains(wikiLink) || (event.key !== "Enter" && event.key !== " ")) {
            return;
        }
        event.preventDefault();
        void activatePane().then(() => openInternalPreviewLink(wikiLink.getAttribute("data-link") || "", wikiLink));
    });
}

function openPreviewImageLightbox(image: HTMLImageElement) {
    if (!image.src || image.alt.startsWith("[Image not found:")) {
        return;
    }
    imageFsPreview.src = image.src;
    imageFsTitle.textContent =
        image.alt || image.getAttribute("data-vault-path") || image.getAttribute("src") || "Image";
    imageFullscreenOverlay.style.display = "flex";
}

function enhancePreviewInternalLinks(previewTarget: HTMLElement = preview) {
    previewTarget.querySelectorAll<HTMLElement>(".wiki-link").forEach((link) => {
        link.tabIndex = 0;
        link.setAttribute("role", "link");
    });
}

function isInternalPreviewLink(link: HTMLAnchorElement): boolean {
    const href = link.getAttribute("href") || "";
    return Boolean(href)
        && !href.startsWith("#")
        && !/^(https?:|mailto:|data:)/i.test(href);
}

async function refreshPreviewInternalLinkStates(
    previewTarget: HTMLElement = preview,
    runtime: PrimaryDocumentRuntime = primaryDocumentRuntime,
    expectedGeneration = runtime.openGeneration,
) {
    const isLegacyPreview = previewTarget === preview;
    const requestGeneration = isLegacyPreview
        ? ++previewLinkStateGeneration
        : (richPreviewLinkStateGenerations.get(previewTarget) || 0) + 1;
    if (!isLegacyPreview) richPreviewLinkStateGenerations.set(previewTarget, requestGeneration);
    const currentPath = runtime.currentFilePath;
    const isCurrent = () => (isLegacyPreview
        ? requestGeneration === previewLinkStateGeneration && runtime === primaryDocumentRuntime
        : richPreviewLinkStateGenerations.get(previewTarget) === requestGeneration)
        && currentPath === runtime.currentFilePath
        && expectedGeneration === runtime.openGeneration;
    const links = Array.from(previewTarget.querySelectorAll<HTMLElement>(".wiki-link"));
    const markdownLinks = Array.from(previewTarget.querySelectorAll<HTMLAnchorElement>("a")).filter(isInternalPreviewLink);
    const candidates = [...links, ...markdownLinks];
    if (candidates.length === 0) {
        return;
    }

    candidates.forEach((link) => link.classList.remove("broken", "preparing"));
    try {
        const state = await LinkService.GetIndexState();
        if (!isCurrent()) {
            return;
        }
        if (!state.ready) {
            candidates.forEach((link) => link.classList.add("preparing"));
            return;
        }
        const indexedLinks = await LinkService.GetLinkInfo(currentPath || "");
        if (!isCurrent()) {
            return;
        }
        candidates.forEach((link) => {
            const rawTarget = link instanceof HTMLAnchorElement
                ? link.getAttribute("href") || ""
                : link.getAttribute("data-link") || "";
            const target = parseInternalLinkTarget(rawTarget);
            if (!target.target) {
                return;
            }
            link.classList.toggle("broken", !findStructuredPreviewLink(indexedLinks, rawTarget, link)?.exists);
        });
    } catch (err) {
        console.warn("Failed to resolve preview links:", err);
    }
}

async function openInternalPreviewLink(rawTarget: string, linkEl: HTMLElement) {
    const linkTarget = parseInternalLinkTarget(rawTarget);
    if (!linkTarget.target && !linkTarget.fragment) {
        return;
    }

    try {
        if (!linkTarget.target) {
            navigateToFragment(linkTarget.fragment, linkTarget.fragmentType!);
            return;
        }
        const sourcePath = primaryDocumentRuntime.currentFilePath;
        const sourceOpenGeneration = primaryDocumentRuntime.openGeneration;
        const state = await LinkService.GetIndexState();
        if (!sourcePath || sourceOpenGeneration !== primaryDocumentRuntime.openGeneration || sourcePath !== primaryDocumentRuntime.currentFilePath) {
            return;
        }
        if (!state.ready) {
            linkEl.classList.add("preparing");
            return;
        }
        const indexedLinks = await LinkService.GetLinkInfo(sourcePath);
        if (sourceOpenGeneration !== primaryDocumentRuntime.openGeneration || sourcePath !== primaryDocumentRuntime.currentFilePath) {
            return;
        }
        const structuredLink = findStructuredPreviewLink(indexedLinks, rawTarget, linkEl);
        linkEl.classList.toggle("broken", !structuredLink?.exists);
        if (!structuredLink?.exists || !structuredLink.targetPath) {
            showBrokenLinkDialog(linkTarget.target, sourcePath, previewLinkKind(linkEl), linkEl);
            return;
        }

        await openFile(structuredLink.targetPath, getFileTypeFromPath(structuredLink.targetPath));
        if (linkTarget.fragment) {
            navigateToFragment(linkTarget.fragment, linkTarget.fragmentType!);
        }
    } catch (err) {
        console.error("Failed to open internal link:", err);
        linkEl.classList.add("broken");
    }
}

function previewLinkKind(link: HTMLElement): "wikilink" | "markdown" {
    return link instanceof HTMLAnchorElement ? "markdown" : "wikilink";
}

function findStructuredPreviewLink(links: Link[], rawTarget: string, element: HTMLElement): Link | undefined {
    const target = parseInternalLinkTarget(rawTarget);
    const kind = previewLinkKind(element);
    return links.find((link) => link.kind === kind
        && link.text === target.target
        && (link.fragment || "") === target.fragment
        && (link.fragmentType || "") === (target.fragmentType || ""));
}

function navigateToFragment(fragment: string, fragmentType: "heading" | "block") {
    const line = findFragmentLine(editor.value, fragment, fragmentType);
    if (line < 0) {
        console.warn(`Linked ${fragmentType} was not found: ${fragment}`);
        return;
    }
    jumpToLine(line);
    window.requestAnimationFrame(() => {
        const selector = fragmentType === "heading" ? "h1, h2, h3, h4, h5, h6" : "p, li, blockquote";
        const match = Array.from(preview.querySelectorAll<HTMLElement>(selector)).find((element) => {
            const text = element.textContent || "";
            return fragmentType === "heading"
                ? text.trim().replace(/\s+/g, " ").toLocaleLowerCase() === fragment.trim().replace(/\s+/g, " ").toLocaleLowerCase()
                : new RegExp(`(?:^|\\s)\\^${escapeRegExp(fragment)}(?=\\s|$)`).test(text);
        });
        match?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setupBrokenLinkDialog() {
    brokenLinkCancel.addEventListener("click", hideBrokenLinkDialog);
    brokenLinkCreate.addEventListener("click", () => void createBrokenLinkTarget());
    brokenLinkOverlay.addEventListener("click", (event) => {
        if (event.target === brokenLinkOverlay) {
            hideBrokenLinkDialog();
        }
    });
    brokenLinkOverlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            hideBrokenLinkDialog();
        }
    });
}

function showBrokenLinkDialog(target: string, sourcePath: string, kind: "wikilink" | "markdown", source: HTMLElement) {
    const createPath = getCreatePathForInternalLink(target, sourcePath, kind);
    pendingBrokenLinkTarget = createPath;
    brokenLinkRestoreFocus = source;
    brokenLinkDescription.textContent = createPath
        ? `“${createPath}” does not exist. Create this note?`
        : `“${target}” does not exist.`;
    brokenLinkStatus.textContent = createPath ? "" : "This link would create a note outside the vault.";
    brokenLinkStatus.hidden = Boolean(createPath);
    brokenLinkCreate.disabled = !createPath;
    brokenLinkOverlay.style.display = "flex";
    (createPath ? brokenLinkCreate : brokenLinkCancel).focus();
}

function hideBrokenLinkDialog() {
    pendingBrokenLinkTarget = null;
    brokenLinkOverlay.style.display = "none";
    const restoreFocus = brokenLinkRestoreFocus;
    brokenLinkRestoreFocus = null;
    if (restoreFocus?.isConnected) {
        restoreFocus.focus();
    }
}

async function createBrokenLinkTarget() {
    const path = pendingBrokenLinkTarget;
    if (!path) {
        return;
    }
    brokenLinkCreate.disabled = true;
    brokenLinkStatus.hidden = true;
    try {
        await FileService.CreateFile(path, "");
        await loadFileTree();
        await LinkService.RebuildIndex();
        hideBrokenLinkDialog();
        await openFile(path, "markdown");
    } catch (err) {
        console.error("Failed to create linked note:", err);
        brokenLinkStatus.textContent = `Could not create “${path}”: ${err instanceof Error ? err.message : String(err)}`;
        brokenLinkStatus.hidden = false;
        brokenLinkCreate.disabled = false;
    }
}

function enhanceCodeBlocks(previewTarget: HTMLElement = preview) {
    previewTarget.querySelectorAll<HTMLPreElement>("pre").forEach((pre) => {
        const code = pre.querySelector("code");
        if (!code || pre.querySelector(":scope > .code-copy-btn")) {
            return;
        }

        pre.classList.add("code-block");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "code-copy-btn";
        button.title = "Copy code";
        button.setAttribute("aria-label", "Copy code");
        button.innerHTML = renderIcon("copy");
        button.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                await Clipboard.SetText(code.textContent || "");
                button.classList.add("copied");
                button.title = "Copied";
                window.setTimeout(() => {
                    button.classList.remove("copied");
                    button.title = "Copy code";
                }, 1200);
            } catch (err) {
                console.error("Failed to copy code:", err);
            }
        });
        pre.appendChild(button);
    });
}

// Outline
function updateOutline(content: string) {
    renderSharedOutline(content, null);
}

function renderSharedOutline(content: string, surface: RichSurface | null) {
    const headings = extractHeadings(content);
    outlineList.innerHTML = renderOutlineHTML(headings);
    activeOutlineIndex = -1;
    const previewTarget = surface?.preview || preview;
    const editorTarget = surface?.editor || editor;
    const previewHeadings = Array.from(previewTarget.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
    const outlineItems = Array.from(outlineList.querySelectorAll<HTMLElement>(".outline-item"));
    for (let index = 0; index < Math.min(headings.length, previewHeadings.length, outlineItems.length); index += 1) {
        previewHeadings[index].dataset.headingIndex = String(index);
        outlineItems[index].dataset.headingIndex = String(index);
    }

    // Click to jump to heading (renderOutlineHTML emits real <button> for macOS AX)
    outlineList.querySelectorAll(".outline-item").forEach(item => {
        const heading = item.textContent || "heading";
        item.setAttribute("aria-label", `Go to heading: ${heading}`);
        const open = () => {
            const line = parseInt(item.getAttribute("data-line") || "0");
            const index = parseInt(item.getAttribute("data-heading-index") || "-1", 10);
            jumpToLineInEditor(editorTarget, line);
            const heading = previewTarget.querySelector<HTMLElement>(`[data-heading-index="${index}"]`);
            heading?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            setActiveOutlineIndex(index, true);
        };
        item.addEventListener("click", open);
        item.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open();
            }
        });
    });
    const first = previewTarget.querySelector<HTMLElement>("[data-heading-index]");
    if (first) setActiveOutlineIndex(Number(first.dataset.headingIndex), false);
}

function syncPreviewHeadingAnchors(count: number) {
    const previewHeadings = Array.from(preview.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
    const outlineItems = Array.from(outlineList.querySelectorAll<HTMLElement>(".outline-item"));
    const max = Math.min(count, previewHeadings.length, outlineItems.length);

    for (let index = 0; index < max; index++) {
        previewHeadings[index].dataset.headingIndex = String(index);
        outlineItems[index].dataset.headingIndex = String(index);
    }
}

function scrollPreviewHeadingIntoView(index: number) {
    if (index < 0) return;
    const heading = preview.querySelector<HTMLElement>(`[data-heading-index="${index}"]`);
    if (!heading) return;
    preview.scrollTo({
        top: Math.max(0, heading.offsetTop - 16),
        behavior: "smooth",
    });
}

function updateActiveOutlineFromPreview() {
    const headings = Array.from(preview.querySelectorAll<HTMLElement>("[data-heading-index]"));
    if (headings.length === 0) {
        setActiveOutlineIndex(-1, false);
        return;
    }

    const marker = preview.scrollTop + 80;
    let nextIndex = parseInt(headings[0].dataset.headingIndex || "0", 10);
    for (const heading of headings) {
        if (heading.offsetTop <= marker) {
            nextIndex = parseInt(heading.dataset.headingIndex || "0", 10);
        } else {
            break;
        }
    }
    setActiveOutlineIndex(nextIndex, true);
}

function setActiveOutlineIndex(index: number, reveal: boolean) {
    if (activeOutlineIndex === index) return;
    activeOutlineIndex = index;

    outlineList.querySelectorAll(".outline-item.active").forEach((item) => {
        item.classList.remove("active");
    });

    if (index < 0) return;
    const item = outlineList.querySelector<HTMLElement>(`.outline-item[data-heading-index="${index}"]`);
    if (!item) return;
    item.classList.add("active");
    if (reveal) {
        item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
}

function setupNoteSearch() {
    noteSearch.hidden = true;

    noteSearchInput.addEventListener("input", () => {
        noteSearchQuery = noteSearchInput.value;
        runNoteSearch(0);
    });

    noteSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            selectNoteSearchMatch(noteSearchIndex + (e.shiftKey ? -1 : 1));
        } else if (e.key === "Escape") {
            e.preventDefault();
            closeNoteSearch();
        }
    });

    noteSearchPrev.addEventListener("click", () => selectNoteSearchMatch(noteSearchIndex - 1));
    noteSearchNext.addEventListener("click", () => selectNoteSearchMatch(noteSearchIndex + 1));
    noteSearchClose.addEventListener("click", closeNoteSearch);
}

function openNoteSearch() {
    const rich = activeRichSurface();
    if (rich) {
        richNoteSearchControllers.get(rich.paneId)?.open();
        return;
    }
    noteSearch.hidden = false;
    noteSearchInput.value = noteSearchQuery;
    refreshNoteSearchHighlights();
    window.requestAnimationFrame(() => {
        noteSearchInput.focus();
        noteSearchInput.select();
    });
}

function closeNoteSearch() {
    const rich = activeRichSurface();
    if (rich && !rich.noteSearch.hidden) {
        richNoteSearchControllers.get(rich.paneId)?.close();
        return;
    }
    noteSearch.hidden = true;
    noteSearchQuery = "";
    noteSearchInput.value = "";
    clearNoteSearchHighlights();
    updateNoteSearchCount();
}

function refreshNoteSearchHighlights() {
    if (noteSearch.hidden && !noteSearchQuery) {
        return;
    }
    const previousIndex = noteSearchIndex;
    runNoteSearch(previousIndex < 0 ? 0 : previousIndex);
}

function runNoteSearch(preferredIndex: number) {
    clearNoteSearchHighlights();
    noteSearchQuery = noteSearchInput.value;
    const query = noteSearchQuery.trim();
    if (!query) {
        updateNoteSearchCount();
        return;
    }

    noteSearchMatches = highlightTextMatches(preview, query);
    if (noteSearchMatches.length > 0) {
        selectNoteSearchMatch(Math.min(preferredIndex, noteSearchMatches.length - 1));
    } else {
        noteSearchIndex = -1;
        updateNoteSearchCount();
    }
}

function clearNoteSearchHighlights() {
    const marks = Array.from(preview.querySelectorAll<HTMLElement>("mark.note-search-match"));
    for (const mark of marks) {
        const parent = mark.parentNode;
        mark.replaceWith(document.createTextNode(mark.textContent || ""));
        parent?.normalize();
    }
    noteSearchMatches = [];
    noteSearchIndex = -1;
}

function highlightTextMatches(root: HTMLElement, query: string): HTMLElement[] {
    const matches: HTMLElement[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || !node.textContent) {
                return NodeFilter.FILTER_REJECT;
            }
            if (parent.closest("script, style, textarea, button, .code-copy-btn, .note-search-match")) {
                return NodeFilter.FILTER_REJECT;
            }
            return node.textContent.toLowerCase().includes(query.toLowerCase())
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        },
    });

    const textNodes: Text[] = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
    }

    const lowerQuery = query.toLowerCase();
    for (const textNode of textNodes) {
        const text = textNode.textContent || "";
        const lowerText = text.toLowerCase();
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let index = lowerText.indexOf(lowerQuery);

        while (index !== -1) {
            if (index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
            }
            const mark = document.createElement("mark");
            mark.className = "note-search-match";
            mark.textContent = text.slice(index, index + query.length);
            fragment.appendChild(mark);
            matches.push(mark);
            lastIndex = index + query.length;
            index = lowerText.indexOf(lowerQuery, lastIndex);
        }

        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        textNode.replaceWith(fragment);
    }

    return matches;
}

function selectNoteSearchMatch(nextIndex: number) {
    if (noteSearchMatches.length === 0) {
        noteSearchIndex = -1;
        updateNoteSearchCount();
        return;
    }

    noteSearchMatches.forEach((match) => match.classList.remove("active"));
    noteSearchIndex = (nextIndex + noteSearchMatches.length) % noteSearchMatches.length;
    const activeMatch = noteSearchMatches[noteSearchIndex];
    activeMatch.classList.add("active");
    activeMatch.scrollIntoView({ block: "center", behavior: "smooth" });
    updateNoteSearchCount();
}

function updateNoteSearchCount() {
    if (!noteSearchQuery.trim()) {
        noteSearchCount.textContent = "0/0";
        return;
    }
    noteSearchCount.textContent =
        noteSearchMatches.length === 0 ? "0/0" : `${noteSearchIndex + 1}/${noteSearchMatches.length}`;
}

function jumpToLine(lineNumber: number) {
    jumpToLineInEditor(editor, lineNumber);
}

function jumpToLineInEditor(target: HTMLTextAreaElement, lineNumber: number) {
    const lines = target.value.split("\n");
    let pos = 0;
    for (let i = 0; i < lineNumber && i < lines.length; i++) {
        pos += lines[i].length + 1;
    }
    target.focus();
    target.setSelectionRange(pos, pos);
    // Calculate actual line height from computed styles
    const computedStyle = getComputedStyle(target);
    const fontSize = parseFloat(computedStyle.fontSize);
    const lineHeightStr = computedStyle.lineHeight;
    // lineHeight can be "normal", a number, or a pixel value
    let lineHeight: number;
    if (lineHeightStr === "normal") {
        lineHeight = fontSize * 1.2; // default normal line-height
    } else if (lineHeightStr.endsWith("px")) {
        lineHeight = parseFloat(lineHeightStr);
    } else {
        // It's a multiplier (e.g., "1.6")
        lineHeight = fontSize * parseFloat(lineHeightStr);
    }
    // Scroll to position, centering the target line in view
    target.scrollTop = lineNumber * lineHeight - target.clientHeight / 3;
}


// Timeline
function toggleTimeline() {
    showTimeline = !showTimeline;
    const surface = activeRichSurface();
    if (surface) {
        hideRichSurfaceViewers(surface);
        if (showTimeline) {
            surface.timelinePanel.style.display = "block";
            void loadTimelines(surface.timelineList);
        } else {
            surface.editorContainer.style.display = "flex";
        }
        return;
    }
    hideAllViewers();
    if (showTimeline) {
        timelinePanel.style.display = "block";
        loadTimelines();
    } else {
        editorContainer.style.display = "flex";
    }
}

async function loadTimelines(target: HTMLElement = timelineTimeline) {
    try {
        // Get timelines from the last 7 days
        const timelines = await NoteService.GetRecentTimelines(7);
        renderTimelines(timelines, target);
    } catch (err) {
        console.error("Failed to load timelines:", err);
        target.innerHTML = '<div class="error">No memos yet</div>';
    }
}

function renderTimelines(timelines: Timeline[], target: HTMLElement = timelineTimeline) {
    target.innerHTML = "";

    let currentDate = "";

    for (const timeline of timelines) {
        // Add date separator if date changed
        if (timeline.date && timeline.date !== currentDate) {
            currentDate = timeline.date;
            const dateSeparator = document.createElement("div");
            dateSeparator.className = "timeline-date-separator";
            dateSeparator.textContent = currentDate;
            target.appendChild(dateSeparator);
        }

        const el = document.createElement("div");
        el.className = "timeline-item";
        const time = document.createElement("div");
        time.className = "timeline-time";
        time.textContent = timeline.time;
        const content = document.createElement("div");
        content.className = "timeline-content";
        content.textContent = timeline.content;
        el.append(time, content);
        target.appendChild(el);
    }

    if (timelines.length === 0) {
        target.innerHTML = '<div class="empty">No memos yet. Start writing!</div>';
    }
}

async function submitTimeline(surface: RichSurface | null = null) {
    const input = surface?.timelineInput || timelineInput;
    const target = surface?.timelineList || timelineTimeline;
    const content = input.value.trim();
    if (!content) return;

    try {
        await NoteService.AddTimeline(content);
        input.value = "";
        await loadTimelines(target);
    } catch (err) {
        console.error("Failed to add timeline:", err);
    }
}

// Backlinks and outgoing links share one immutable index generation.
function updatePaneSidebarContent(paneId: string, path: string, content: string): void {
    paneSidebarStates.set(paneId, updatePaneSidebarCache(paneSidebarStates.get(paneId), path, content));
}

function renderActiveSharedSidebar(): void {
    const activeDocument = primaryDocumentRuntime.activeEditableDocument;
    const visibility = sidebarVisibilityForActivePane(activePaneId, legacySurfacePaneId, activeDocument?.kind);
    applySidebarVisibility(rightSidebar, rightSidebarResizeHandle, visibility);
    if (!activeDocument || activeDocument.kind !== "markdown") {
        outlineList.innerHTML = '<div class="outline-empty">Headings you write will gather here</div>';
        clearBacklinks();
        clearOutgoingLinks();
        return;
    }
    const state = paneSidebarStates.get(activePaneId);
    if (!state || state.path !== activeDocument.snapshot.path) {
        outlineList.innerHTML = '<div class="outline-empty">Headings you write will gather here</div>';
        renderLinkIndexPreparing();
        return;
    }
    renderSharedOutline(state.content, activeRichSurface());
    if (state.preparing || !state.backlinks || !state.mentions || !state.outgoing) {
        renderLinkIndexPreparing();
        return;
    }
    renderBacklinks(state.backlinks, state.mentions);
    renderOutgoingLinks(state.outgoing);
}

async function loadRichLinkPanels(paneId: string, runtime: PrimaryDocumentRuntime, document: EditableDocument): Promise<void> {
    if (document.kind !== "markdown") return;
    const requestGeneration = (richLinkPanelRequestGenerations.get(paneId) ?? 0) + 1;
    richLinkPanelRequestGenerations.set(paneId, requestGeneration);
    const isCurrent = () => documentRuntimeFactory.canPublishLocal(paneId, runtime, document.generation)
        && runtime.activeEditableDocument === document
        && runtime.currentFilePath === document.snapshot.path
        && richLinkPanelRequestGenerations.get(paneId) === requestGeneration;
    try {
        const snapshot = await LinkService.GetLinkIndexSnapshot();
        if (!isCurrent()) return;
        if (!snapshot.ready) {
            const previous = paneSidebarStates.get(paneId);
            if (previous?.path === document.snapshot.path) paneSidebarStates.set(paneId, { ...previous, preparing: true });
            if (paneId === activePaneId) renderActiveSharedSidebar();
            return;
        }
        const [backlinksResult, mentionsResult] = await Promise.all([
            LinkService.GetBacklinksFromSnapshot(snapshot, document.snapshot.path),
            LinkService.GetUnlinkedMentions(document.snapshot.path),
        ]);
        if (!isCurrent() || !backlinksResult.ready || backlinksResult.generation !== snapshot.generation
            || !mentionsResult.ready || mentionsResult.generation !== snapshot.generation) return;
        const previous = paneSidebarStates.get(paneId);
        if (previous?.path !== document.snapshot.path) return;
        paneSidebarStates.set(paneId, {
            path: document.snapshot.path,
            content: previous?.content ?? "",
            backlinks: backlinksResult.backlinks,
            mentions: mentionsResult.mentions,
            outgoing: snapshot.links[document.snapshot.path] || [],
            preparing: false,
        });
        if (paneId === activePaneId) renderActiveSharedSidebar();
    } catch (error) {
        if (!isCurrent()) return;
        console.error("Failed to load rich link panels:", error);
        const previous = paneSidebarStates.get(paneId);
        if (previous?.path === document.snapshot.path) paneSidebarStates.set(paneId, { ...previous, backlinks: [], mentions: [], outgoing: [], preparing: false });
        if (paneId === activePaneId) renderActiveSharedSidebar();
    }
}

async function refreshOpenLinkPanels() {
    const document = primaryDocumentRuntime.activeEditableDocument;
    if (!document || document.kind !== "markdown" || !primaryDocumentRuntime.currentFilePath) {
        return;
    }
    if (richSurfaceForPane(activePaneId)) {
        await loadRichLinkPanels(activePaneId, primaryDocumentRuntime, document);
        return;
    }
    await loadLinkPanels(primaryDocumentRuntime.currentFilePath, document.generation);
}

async function loadLinkPanels(path: string, generation = primaryDocumentRuntime.openGeneration) {
    const paneId = activePaneId;
    const runtime = primaryDocumentRuntime;
    const document = runtime.activeEditableDocument;
    if (!document || document.kind !== "markdown" || document.snapshot.path !== path) return;
    const requestGeneration = ++linkPanelRequestGeneration;
    try {
        const snapshot = await LinkService.GetLinkIndexSnapshot();
        if (!isCurrentOpenGeneration(generation, runtime.openGeneration) || requestGeneration !== linkPanelRequestGeneration || path !== runtime.currentFilePath || runtime.activeEditableDocument !== document) {
            return;
        }
        if (!snapshot.ready) {
            const previous = paneSidebarStates.get(paneId);
            if (previous?.path === path) paneSidebarStates.set(paneId, { ...previous, preparing: true });
            if (paneId === activePaneId) renderActiveSharedSidebar();
            return;
        }
        const [backlinksResult, mentionsResult] = await Promise.all([
            LinkService.GetBacklinksFromSnapshot(snapshot, path),
            LinkService.GetUnlinkedMentions(path),
        ]);
        if (!isCurrentOpenGeneration(generation, runtime.openGeneration)
            || requestGeneration !== linkPanelRequestGeneration
            || path !== runtime.currentFilePath
            || runtime.activeEditableDocument !== document
            || !backlinksResult.ready
            || backlinksResult.generation !== snapshot.generation
            || !mentionsResult.ready
            || mentionsResult.generation !== snapshot.generation) {
            return;
        }
        const previous = paneSidebarStates.get(paneId);
        if (previous?.path !== path) return;
        paneSidebarStates.set(paneId, {
            ...previous,
            backlinks: backlinksResult.backlinks,
            mentions: mentionsResult.mentions,
            outgoing: snapshot.links[path] || [],
            preparing: false,
        });
        if (paneId === activePaneId) renderActiveSharedSidebar();
    } catch (err) {
        console.error("Failed to load link panels:", err);
        const previous = paneSidebarStates.get(paneId);
        if (previous?.path === path && runtime.activeEditableDocument === document) {
            paneSidebarStates.set(paneId, { ...previous, backlinks: [], mentions: [], outgoing: [], preparing: false });
        }
        if (paneId === activePaneId) renderActiveSharedSidebar();
    }
}

function clearBacklinks() {
    backlinksList.innerHTML = '<div class="empty">No notes link here yet</div>';
}

function renderLinkIndexPreparing() {
    backlinksList.innerHTML = '<div class="empty">Link index is preparing…</div>';
    outgoingLinksList.innerHTML = '<div class="empty">Link index is preparing…</div>';
}

function appendBacklinkSection(titleText: string, items: HTMLElement[]) {
    if (items.length === 0) return;
    const section = document.createElement("section");
    section.className = "backlink-section";
    const title = document.createElement("h4");
    title.className = "backlink-section-title";
    title.textContent = titleText;
    section.append(title, ...items);
    backlinksList.appendChild(section);
}

function makeBacklinkItem(titleText: string, contextText: string, sourcePath: string, kind: "linked" | "unlinked"): HTMLElement {
    const el = document.createElement("div");
    el.className = `backlink-item ${kind}`;
    const title = document.createElement("div");
    title.className = "backlink-title";
    title.textContent = titleText;
    const context = document.createElement("div");
    context.className = "backlink-context";
    context.textContent = contextText;
    el.append(title, context);
    el.tabIndex = 0;
    el.setAttribute("role", "link");
    const open = (event: Event) => {
        event.stopPropagation();
        void openNote(sourcePath);
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open(event);
        }
    });
    return el;
}

function renderBacklinks(backlinks: Backlink[], mentions: UnlinkedMention[]) {
    backlinksList.innerHTML = "";

    appendBacklinkSection("Linked mentions", backlinks.map((backlink) =>
        makeBacklinkItem(backlink.sourceTitle, backlink.context, backlink.sourcePath, "linked"),
    ));
    appendBacklinkSection("Unlinked mentions", mentions.map((mention) =>
        makeBacklinkItem(mention.sourceTitle, mention.context, mention.sourcePath, "unlinked"),
    ));

    if (backlinks.length === 0 && mentions.length === 0) {
        backlinksList.innerHTML = '<div class="empty">No notes link here yet</div>';
    }
}

function clearOutgoingLinks() {
    outgoingLinksList.innerHTML = '<div class="empty">No links from this note yet</div>';
}

function renderOutgoingLinks(links: Link[]) {
    outgoingLinksList.innerHTML = "";

    const filteredLinks = links.filter((link) => link.exists);

    for (const link of filteredLinks) {
        const el = document.createElement("div");
        el.className = "outgoing-link-item exists";
        const text = document.createElement("span");
        text.className = "link-text";
        text.textContent = link.alias || link.text;
        el.appendChild(text);
        el.tabIndex = 0;
        el.setAttribute("role", "link");
        const open = (e: Event) => {
            e.stopPropagation();
            void openFile(link.targetPath, getFileTypeFromPath(link.targetPath));
        };
        el.addEventListener("click", open);
        el.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open(event);
            }
        });
        outgoingLinksList.appendChild(el);
    }

    if (filteredLinks.length === 0) {
        outgoingLinksList.innerHTML = '<div class="empty">No links from this note yet</div>';
    }
}

// Resize Panels
function applyExplorerWidths(state: ExplorerRuntimeState) {
    document.getElementById("sidebar")!.style.width = `${state.leftSidebarWidth}px`;
    rightSidebar.style.width = `${state.rightSidebarWidth}px`;
    document.documentElement.style.setProperty("--backlinks-width", `${state.rightSidebarWidth}px`);
    (document.getElementById("settings-sidebar-width") as HTMLInputElement).value = String(state.leftSidebarWidth);
}

async function loadPersistedExplorerWidths() {
    const [session, configuredWidth] = await Promise.all([
        StateService.GetExplorerSessionState(),
        ConfigService.GetSidebarWidth(),
    ]);
    explorerSessionState = {
        ...session,
        leftSidebarWidth: (session.leftSidebarWidth ?? 0) > 0 ? session.leftSidebarWidth! : configuredWidth,
        rightSidebarWidth: (session.rightSidebarWidth ?? 0) > 0 ? session.rightSidebarWidth! : configuredWidth,
    } as ExplorerRuntimeState;
    applyExplorerWidths(explorerSessionState);
}

async function persistExplorerWidths(nextState: ExplorerRuntimeState, updateConfiguredWidth: boolean) {
    const previousState = { ...explorerSessionState } as ExplorerRuntimeState;
    let previousConfiguredWidth: number | null = null;
    const retry = () => persistExplorerWidths(nextState, updateConfiguredWidth);
    try {
        if (updateConfiguredWidth) {
            previousConfiguredWidth = await ConfigService.GetSidebarWidth();
            await ConfigService.SetSidebarWidth(nextState.leftSidebarWidth);
        }
        await StateService.SetExplorerSessionState(nextState);
        explorerSessionState = nextState;
        applyExplorerWidths(nextState);
        settingsStatus.textContent = "Sidebar width saved.";
        settingsRetry.hidden = true;
    } catch (err) {
        try {
            if (previousConfiguredWidth !== null) await ConfigService.SetSidebarWidth(previousConfiguredWidth);
            await StateService.SetExplorerSessionState(previousState);
            await loadPersistedExplorerWidths();
        } catch (rollbackError) {
            console.error("Failed to restore sidebar widths after a save error:", rollbackError);
        }
        const message = `Could not save sidebar width: ${describeOperationError(err)}.`;
        showSettingsFailure(message, retry);
        announceOperation(`${message} Retry to save it.`, retry);
    }
}

function setupResizeHandles() {
    const sidebar = document.getElementById("sidebar")!;
    const sidebarResize = document.getElementById("sidebar-resize")!;
    const rightSidebar = document.getElementById("right-sidebar")!;
    const editorPane = document.getElementById("editor-pane")!;
    const editorResize = document.getElementById("editor-resize")!;

    // Sidebar resize
    let isResizingSidebar = false;
    let isResizingRightSidebar = false;
    sidebarResize.addEventListener("mousedown", (e) => {
        isResizingSidebar = true;
        sidebarResize.classList.add("dragging");
        e.preventDefault();
    });
    rightSidebarResizeHandle.addEventListener("mousedown", (event) => { isResizingRightSidebar = true; rightSidebarResizeHandle.classList.add("dragging"); event.preventDefault(); });

    // Editor/Preview resize
    let isResizingEditor = false;
    editorResize.addEventListener("mousedown", (e) => {
        isResizingEditor = true;
        editorResize.classList.add("dragging");
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (isResizingSidebar) {
            const newWidth = e.clientX;
            if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
                sidebar.style.width = `${newWidth}px`;
            }
        }
        if (isResizingRightSidebar) {
            const width = window.innerWidth - e.clientX;
            if (width >= MIN_SIDEBAR_WIDTH && width <= MAX_SIDEBAR_WIDTH) {
                // .right-sidebar sizes from flex-basis via --backlinks-width, so
                // updating style.width alone never moves it. Update the variable.
                rightSidebar.style.width = `${width}px`;
                document.documentElement.style.setProperty("--backlinks-width", `${width}px`);
            }
        }
        if (isResizingEditor) {
            const container = editorPane.parentElement!;
            const containerRect = container.getBoundingClientRect();
            const newWidth = e.clientX - containerRect.left;
            const containerWidth = containerRect.width;
            if (newWidth >= 200 && newWidth <= containerWidth - 200) {
                editorPane.style.flex = "none";
                editorPane.style.width = `${newWidth}px`;
            }
        }
    });

    document.addEventListener("mouseup", () => {
        if (isResizingSidebar) {
            const width = sidebar.getBoundingClientRect().width;
            void persistExplorerWidths({ ...explorerSessionState, leftSidebarWidth: width }, true);
        }
        if (isResizingRightSidebar) {
            const width = rightSidebar.getBoundingClientRect().width;
            void persistExplorerWidths({ ...explorerSessionState, rightSidebarWidth: width }, false);
        }
        isResizingSidebar = false;
        isResizingEditor = false;
        isResizingRightSidebar = false;
        sidebarResize.classList.remove("dragging");
        editorResize.classList.remove("dragging");
        rightSidebarResizeHandle.classList.remove("dragging");
    });
}

function loadRightSidebarLayout(): RightSidebarLayout {
    try {
        return normalizeRightSidebarLayout(JSON.parse(window.localStorage.getItem(RIGHT_SIDEBAR_LAYOUT_KEY) || "null"));
    } catch {
        return defaultRightSidebarLayout();
    }
}

function saveRightSidebarLayout() {
    window.localStorage.setItem(RIGHT_SIDEBAR_LAYOUT_KEY, JSON.stringify(rightSidebarLayout));
}

function setupRightSidebarLayoutControls() {
    applyRightSidebarLayout();

    rightSidebar.querySelectorAll<HTMLElement>("[data-sidebar-section-toggle]").forEach((header) => {
        header.addEventListener("click", () => {
            const section = header.dataset.sidebarSectionToggle as RightSidebarSectionId | undefined;
            if (!section) return;
            rightSidebarLayout = toggleRightSidebarSection(rightSidebarLayout, section);
            applyRightSidebarLayout();
            saveRightSidebarLayout();
        });
    });

    setupRightSidebarResizeHandle("outline-resize", "outline", "outgoing");
    setupRightSidebarResizeHandle("outgoing-resize", "outgoing", "backlinks");
}

function getRightSidebarSectionElement(section: RightSidebarSectionId): HTMLElement {
    return document.querySelector<HTMLElement>(`[data-sidebar-section="${section}"]`)!;
}

function applyRightSidebarLayout() {
    for (const section of RIGHT_SIDEBAR_SECTIONS) {
        const sectionEl = getRightSidebarSectionElement(section);
        const header = rightSidebar.querySelector<HTMLElement>(`[data-sidebar-section-toggle="${section}"]`);
        const collapsed = rightSidebarLayout.collapsed[section];
        sectionEl.classList.toggle("collapsed", collapsed);
        sectionEl.style.flex = collapsed
            ? "0 0 auto"
            : `${Math.max(1, rightSidebarLayout.sizes[section])} 1 0`;
        header?.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }

    updateRightSidebarResizeHandleVisibility();
}

function updateRightSidebarResizeHandleVisibility() {
    setRightSidebarResizeHandleVisible(
        "outline-resize",
        !rightSidebarLayout.collapsed.outline && !rightSidebarLayout.collapsed.outgoing,
    );
    setRightSidebarResizeHandleVisible(
        "outgoing-resize",
        !rightSidebarLayout.collapsed.outgoing && !rightSidebarLayout.collapsed.backlinks,
    );
}

function setRightSidebarResizeHandleVisible(id: string, visible: boolean) {
    const handle = document.getElementById(id);
    handle?.classList.toggle("hidden", !visible);
}

function setupRightSidebarResizeHandle(
    handleId: string,
    beforeSection: RightSidebarSectionId,
    afterSection: RightSidebarSectionId,
) {
    const handle = document.getElementById(handleId);
    if (!handle) return;

    let startY = 0;
    let startBeforeHeight = 0;
    let startAfterHeight = 0;
    let isDragging = false;

    handle.addEventListener("mousedown", (e) => {
        if (rightSidebarLayout.collapsed[beforeSection] || rightSidebarLayout.collapsed[afterSection]) {
            return;
        }

        isDragging = true;
        startY = e.clientY;
        startBeforeHeight = getRightSidebarSectionElement(beforeSection).getBoundingClientRect().height;
        startAfterHeight = getRightSidebarSectionElement(afterSection).getBoundingClientRect().height;
        captureRightSidebarCurrentSizes();
        handle.classList.add("dragging");
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;

        const delta = e.clientY - startY;
        const beforeHeight = startBeforeHeight + delta;
        const afterHeight = startAfterHeight - delta;
        if (beforeHeight < 80 || afterHeight < 80) {
            return;
        }

        rightSidebarLayout = {
            ...rightSidebarLayout,
            sizes: {
                ...rightSidebarLayout.sizes,
                [beforeSection]: beforeHeight,
                [afterSection]: afterHeight,
            },
        };
        applyRightSidebarLayout();
        saveRightSidebarLayout();
    });

    document.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        handle.classList.remove("dragging");
        saveRightSidebarLayout();
    });
}

function captureRightSidebarCurrentSizes() {
    const sizes = { ...rightSidebarLayout.sizes };
    for (const section of RIGHT_SIDEBAR_SECTIONS) {
        if (rightSidebarLayout.collapsed[section]) {
            continue;
        }
        const height = getRightSidebarSectionElement(section).getBoundingClientRect().height;
        if (height > 0) {
            sizes[section] = height;
        }
    }
    rightSidebarLayout = { ...rightSidebarLayout, sizes };
}

// Utilities
async function refresh() {
    await loadFileTree();
    await LinkService.RebuildIndex();
    await refreshOpenLinkPanels();

    // Restore selection without changing user-controlled folder expansion.
    if (primaryDocumentRuntime.currentFilePath) {
        updateFileTreeSelection(primaryDocumentRuntime.currentFilePath, { reveal: false });
    }

    // If graph view is showing, refresh the graph data
    if (showGraph) {
        await refreshGraphData();
    }
}

function setupWindowDoubleClickMaximise() {
    const selectors = [".toolbar", ".sidebar-header"];

    for (const selector of selectors) {
        const element = document.querySelector(selector);
        element?.addEventListener("dblclick", async (e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest("button, input, select, textarea, a, label")) {
                return;
            }
            try {
                await WindowService.ToggleMaximise();
            } catch (err) {
                console.error("Failed to toggle maximize from double click:", err);
            }
        });
    }
}


// Graph View
async function toggleGraphView() {
    if (showGraph) {
        hideGraphView();
    } else {
        await showGraphView();
    }
}

async function showGraphView() {
    showGraph = true;
    graphRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Hide all viewers
    hideAllViewers();

    const graphOverlay = document.getElementById("graph-overlay")!;
    graphOverlay.classList.add("visible");

    // Load and render graph
    await loadGraphData();
    (document.getElementById("graph-search") as HTMLInputElement | null)?.focus();
}

async function hideGraphView() {
    showGraph = false;

    // Save node positions before closing
    saveGraphNodePositions();

    const graphOverlay = document.getElementById("graph-overlay")!;
    graphOverlay.classList.remove("visible");

    // Show editor view
    editorContainer.style.display = "flex";

    // Clean up graph instance
    if (graphInstance) {
        graphInstance._destructor();
        graphInstance = null;
    }
    graphSelectionData = null;
    selectedGraphNodeID = null;
    graphLayoutCanPersist = false;

    // Open last file if exists and no note is currently open
    if (!currentNote) {
        const lastFile = await StateService.GetLastOpenedFile();
        if (lastFile) {
            try {
                await openFile(lastFile.path, lastFile.fileType);
            } catch {
                await StateService.ClearLastOpenedFile();
            }
        }
    }

    graphRestoreFocus?.focus();
    graphRestoreFocus = null;
}

function saveGraphNodePositions() {
    if (!graphInstance || !graphLayoutCanPersist) return;

    const graphData = graphInstance.graphData();
    const positions: { [id: string]: { x: number; y: number } } = {};

    for (const node of graphData.nodes as GraphNodeData[]) {
        if (node.x !== undefined && node.y !== undefined) {
            positions[node.id] = { x: node.x, y: node.y };
        }
    }

    // Save view state (zoom and center)
    const zoom = graphInstance.zoom();
    const center = graphInstance.centerAt();
    const viewState = center ? { zoom, centerX: center.x, centerY: center.y } : undefined;

    // Update cache with positions and view state
    const cached = loadCache(graphCacheStorage);
    if (cached && isCacheValid(cached)) {
        const cachedData = cached.data as CachedGraphData;
        cachedData.graphSignature = createGraphStructureSignature(cachedData.graph);
        cachedData.nodePositions = positions;
        cachedData.viewState = viewState;
        saveCache(graphCacheStorage, createCacheEntry(cachedData, cached.timestamp));
    }
}

// localStorage adapter for graph cache
const graphCacheStorage = {
    get: (key: string) => localStorage.getItem(key),
    set: (key: string, value: string) => localStorage.setItem(key, value),
    remove: (key: string) => localStorage.removeItem(key),
};

interface CachedGraphData {
    graph: Graph;
    stats: { nodeCount: number; edgeCount: number };
    graphSignature?: GraphStructureSignature;
    nodePositions?: { [id: string]: { x: number; y: number } };
    viewState?: { zoom: number; centerX: number; centerY: number };
}

async function loadGraphData(forceRefresh: boolean = false) {
    const graphContainer = document.getElementById("graph-container")!;
    const graphStats = document.getElementById("graph-stats")!;
    const filters = getGraphFilterValues();
    const useDefaultGraphCache = !hasActiveGraphFilters(filters);

    try {
        const cached = useDefaultGraphCache ? loadCache(graphCacheStorage) : null;

        if (cached && isCacheValid(cached) && !forceRefresh) {
            const cachedData = cached.data as CachedGraphData;
            const canReuseLayout = canReuseGraphLayout(cachedData.graphSignature, cachedData.graph);
            const age = getCacheAgeText(cached);
            graphStats.textContent = `${cachedData.stats.nodeCount || 0} notes, ${cachedData.stats.edgeCount || 0} links (${age})`;
            renderGraph(
                cachedData.graph,
                graphContainer,
                canReuseLayout ? cachedData.nodePositions : undefined,
                canReuseLayout ? cachedData.viewState : undefined
            );
            renderGraphAccessibility(cachedData.graph);
            graphLayoutCanPersist = true;

            updateGraphDataInBackground().catch(console.error);
            return;
        }

        graphStats.textContent = "Building index...";
        await LinkService.RebuildIndex();
        const graph = await GraphService.GetGraph(buildGraphOptions(filters));

        if (useDefaultGraphCache) {
            const stats = { nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
            saveCache(graphCacheStorage, createCacheEntry({
                graph,
                stats,
                graphSignature: createGraphStructureSignature(graph),
            }));
        }

        graphStats.textContent = `${graph.nodes.length} nodes, ${graph.edges.length} links`;

        renderGraph(graph, graphContainer);
        renderGraphAccessibility(graph);
        graphLayoutCanPersist = useDefaultGraphCache;
    } catch (err) {
        console.error("Failed to load graph:", err);
        graphStats.textContent = "Failed to load graph";
        graphContainer.innerHTML = '<div class="graph-error">Failed to load graph data</div>';
        graphLayoutCanPersist = false;
    }
}

// Background update - fetches new data but doesn't update UI
async function updateGraphDataInBackground() {
    try {
        await LinkService.RebuildIndex();
        const graph = await GraphService.GetFullGraph();
        const stats = await GraphService.GetGraphStats();

        // Get current positions from cache to preserve them
        const cached = loadCache(graphCacheStorage);
        const cachedData = cached?.data as CachedGraphData | undefined;
        const canReuseLayout = cachedData ? canReuseGraphLayout(cachedData.graphSignature, graph) : false;

        // Save new data to cache, preserving positions and view state
        const cacheData: CachedGraphData = {
            graph,
            stats,
            graphSignature: createGraphStructureSignature(graph),
            nodePositions: canReuseLayout ? cachedData?.nodePositions : undefined,
            viewState: canReuseLayout ? cachedData?.viewState : undefined,
        };
        saveCache(graphCacheStorage, createCacheEntry(cacheData));
        console.log("[Graph] Background update complete");
    } catch (err) {
        console.error("[Graph] Background update failed:", err);
    }
}

async function refreshGraphData() {
    const cached = graphLayoutCanPersist ? loadCache(graphCacheStorage) : null;
    if (cached) {
        const cachedData = cached.data as CachedGraphData;
        cachedData.nodePositions = undefined;
        cachedData.viewState = undefined;
        cachedData.graphSignature = createGraphStructureSignature(cachedData.graph);
        saveCache(graphCacheStorage, createCacheEntry(cachedData, cached.timestamp));
    }
    await loadGraphData(true);
}

function getGraphFilterValues(): GraphFilterValues {
    const selectedDepth = Number((document.getElementById("graph-depth") as HTMLSelectElement).value);
    const depth = GRAPH_DEPTH_OPTIONS.includes(selectedDepth as GraphDepth) ? selectedDepth as GraphDepth : 0;
    return {
        includeUnresolved: (document.getElementById("graph-include-unresolved") as HTMLInputElement).checked,
        includeAttachments: (document.getElementById("graph-include-attachments") as HTMLInputElement).checked,
        excludeOrphans: (document.getElementById("graph-exclude-orphans") as HTMLInputElement).checked,
        tags: (document.getElementById("graph-include-tags") as HTMLInputElement).value,
        excludeTags: (document.getElementById("graph-exclude-tags") as HTMLInputElement).value,
        search: (document.getElementById("graph-search") as HTMLInputElement).value,
        rootPath: (document.getElementById("graph-root-path") as HTMLInputElement).value,
        depth,
    };
}

function getSelectedGraphNode(): GraphNodeLike | undefined {
    return (graphSelectionData?.nodes as unknown as GraphNodeLike[] | undefined)
        ?.find((node) => node.id === selectedGraphNodeID);
}

function findGraphNodeButton(nodeID: string): HTMLButtonElement | undefined {
    return Array.from(document.querySelectorAll<HTMLButtonElement>("#graph-node-list button"))
        .find((button) => button.dataset.nodeId === nodeID);
}

function renderGraphAccessibility(graph: Graph) {
    graphSelectionData = graph;
    const graphNodes = graph.nodes as unknown as GraphNodeLike[];
    if (!graphNodes.some((node) => node.id === selectedGraphNodeID)) {
        selectedGraphNodeID = graphNodes[0]?.id ?? null;
    }

    const nodeList = document.getElementById("graph-node-list")!;
    nodeList.replaceChildren();
    for (const node of [...graphNodes].sort((left, right) => left.label.localeCompare(right.label))) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "graph-node-option";
        option.dataset.nodeId = node.id;
        option.setAttribute("role", "option");
        option.textContent = node.label;
        option.addEventListener("click", () => selectGraphNode(node.id, true));
        option.addEventListener("keydown", (event) => void handleGraphNodeKeydown(event, node.id));
        nodeList.append(option);
    }
    updateGraphSelectionDetails();
}

function selectGraphNode(nodeID: string, focus = false) {
    selectedGraphNodeID = nodeID;
    updateGraphSelectionDetails();
    if (focus) {
        findGraphNodeButton(nodeID)?.focus();
    }
}

function updateGraphSelectionDetails() {
    const selectedNode = getSelectedGraphNode();
    const status = document.getElementById("graph-selection-status")!;
    const incoming = document.getElementById("graph-incoming")!;
    const outgoing = document.getElementById("graph-outgoing")!;
    const openNoteButton = document.getElementById("graph-open-note") as HTMLButtonElement;
    const localGraphButton = document.getElementById("graph-local-node") as HTMLButtonElement;
    const copyPathButton = document.getElementById("graph-copy-path") as HTMLButtonElement;

    document.querySelectorAll<HTMLButtonElement>("#graph-node-list button").forEach((button) => {
        const isSelected = button.dataset.nodeId === selectedNode?.id;
        button.setAttribute("aria-selected", String(isSelected));
        button.tabIndex = isSelected ? 0 : -1;
    });

    if (!selectedNode || !graphSelectionData) {
        status.textContent = "No graph nodes match these filters.";
        incoming.textContent = "Incoming: none";
        outgoing.textContent = "Outgoing: none";
        openNoteButton.disabled = true;
        localGraphButton.disabled = true;
        copyPathButton.disabled = true;
        return;
    }

    const direction = getGraphDirection(graphSelectionData as unknown as GraphLike, selectedNode.id);
    status.textContent = `Selected: ${selectedNode.label}`;
    incoming.textContent = `Incoming (${direction.incoming.length}): ${formatGraphNodeNames(direction.incoming)}`;
    outgoing.textContent = `Outgoing (${direction.outgoing.length}): ${formatGraphNodeNames(direction.outgoing)}`;
    const canOpen = canOpenGraphNode(selectedNode);
    openNoteButton.disabled = !canOpen;
    localGraphButton.disabled = !canOpen;
    copyPathButton.disabled = !canOpen;
}

function formatGraphNodeNames(nodes: GraphNodeLike[]): string {
    return nodes.length > 0 ? nodes.map((node) => node.label).join(", ") : "none";
}

async function handleGraphNodeKeydown(event: KeyboardEvent, nodeID: string) {
    const nodeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#graph-node-list button"));
    const currentIndex = nodeButtons.findIndex((button) => button.dataset.nodeId === nodeID);
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = resolveGraphListNavigation(currentIndex, nodeButtons.length, event.key);
        const nextNode = nextIndex === null ? undefined : nodeButtons[nextIndex];
        if (nextNode?.dataset.nodeId) selectGraphNode(nextNode.dataset.nodeId, true);
        return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const adjacentNodeID = graphSelectionData
            ? resolveGraphEdgeNavigation(graphSelectionData as unknown as GraphLike, nodeID, event.key)
            : null;
        if (adjacentNodeID) selectGraphNode(adjacentNodeID, true);
        return;
    }
    if (event.key === "Enter") {
        event.preventDefault();
        selectGraphNode(nodeID);
        await openSelectedGraphNote();
        return;
    }
    if (event.key === " ") {
        event.preventDefault();
        selectGraphNode(nodeID);
    }
}

async function openSelectedGraphNote() {
    const node = getSelectedGraphNode();
    if (!canOpenGraphNode(node) || !node?.path) return;
    await hideGraphView();
    await openFile(node.path, "markdown");
}

async function showSelectedNodeLocalGraph() {
    const node = getSelectedGraphNode();
    if (!canOpenGraphNode(node) || !node?.path) return;
    (document.getElementById("graph-root-path") as HTMLInputElement).value = node.path;
    await loadGraphData(true);
}

async function copySelectedGraphPath() {
    const node = getSelectedGraphNode();
    if (!canOpenGraphNode(node) || !node?.path) return;
    try {
        const absolutePath = await FileService.GetAbsolutePath(node.path);
        await Clipboard.SetText(absolutePath);
        document.getElementById("graph-selection-status")!.textContent = `Copied path for ${node.label}.`;
    } catch (err) {
        console.error("Failed to copy graph node path:", err);
        document.getElementById("graph-selection-status")!.textContent = "Failed to copy the selected node path.";
    }
}

interface GraphNodeData {
    id: string;
    label: string;
    linkCount: number;
    x?: number;
    y?: number;
    fx?: number;
    fy?: number;
    vx?: number;
    vy?: number;
}

function getNodeRadius(node: GraphNodeData): number {
    return getGraphNodeRadius(node.linkCount);
}

function getLargestHub(nodes: GraphNodeData[]): GraphNodeData | undefined {
    return nodes.reduce<GraphNodeData | undefined>((largest, node) => {
        if (!largest || node.linkCount > largest.linkCount) {
            return node;
        }
        return largest;
    }, undefined);
}

function createCenterGravityForce(strength: number) {
    let nodes: GraphNodeData[] = [];
    const force = (alpha: number) => {
        for (const node of nodes) {
            node.vx = (node.vx ?? 0) - (node.x ?? 0) * strength * alpha;
            node.vy = (node.vy ?? 0) - (node.y ?? 0) * strength * alpha;
        }
    };
    force.initialize = (nextNodes: GraphNodeData[]) => {
        nodes = nextNodes;
    };
    return force;
}

interface GraphEdgeData {
    source: string | GraphNodeData;
    target: string | GraphNodeData;
}

function hasCompleteGraphPositions(
    graph: Graph,
    positions?: { [id: string]: { x: number; y: number } }
): boolean {
    if (!positions) return false;
    return graph.nodes.every((node) => {
        const position = positions[node.id];
        return Number.isFinite(position?.x) && Number.isFinite(position?.y);
    });
}

function graphZoomAt(clientX: number, clientY: number, zoomFactor: number) {
    if (!graphInstance) return;

    const container = document.getElementById("graph-container");
    if (!container) return;

    const currentZoom = graphInstance.zoom();
    const nextZoom = Math.max(0.1, Math.min(8, currentZoom * zoomFactor));
    if (nextZoom === currentZoom) return;

    const rect = container.getBoundingClientRect();
    const center = graphInstance.centerAt() as { x: number; y: number } | undefined;
    if (!center) {
        graphInstance.zoom(nextZoom);
        return;
    }

    const offsetX = clientX - rect.left - rect.width / 2;
    const offsetY = clientY - rect.top - rect.height / 2;
    const graphX = center.x + offsetX / currentZoom;
    const graphY = center.y + offsetY / currentZoom;

    graphInstance.zoom(nextZoom);
    graphInstance.centerAt(
        graphX - offsetX / nextZoom,
        graphY - offsetY / nextZoom
    );
}

function isGraphGestureTarget(target: EventTarget | null): boolean {
    const overlay = document.getElementById("graph-overlay");
    const container = document.getElementById("graph-container");
    return Boolean(
        showGraph &&
        overlay?.classList.contains("visible") &&
        target instanceof Node &&
        (container?.contains(target) || overlay?.contains(target))
    );
}

function isGraphOverlayVisible(): boolean {
    return Boolean(
        showGraph &&
        document.getElementById("graph-overlay")?.classList.contains("visible")
    );
}

function graphGesturePoint(event: Event): { x: number; y: number } {
    if (event instanceof MouseEvent) {
        return { x: event.clientX, y: event.clientY };
    }
    const container = document.getElementById("graph-container");
    const rect = container?.getBoundingClientRect();
    return {
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
    };
}

function handleGraphWheel(e: WheelEvent) {
    if (!graphInstance || !isGraphGestureTarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    if (classifyGraphWheel(e) === "zoom") {
        graphZoomAt(e.clientX, e.clientY, getGraphWheelZoomFactor(e));
        return;
    }

    const center = graphInstance.centerAt() as { x: number; y: number } | undefined;
    const zoom = graphInstance.zoom();
    if (!center || !Number.isFinite(zoom) || zoom <= 0) return;
    const delta = getGraphWheelPanDelta(e, zoom);

    graphInstance.centerAt(
        center.x + delta.x,
        center.y + delta.y
    );
}

function handleGraphGestureStart(e: GestureEvent) {
    if (!graphInstance || !isGraphOverlayVisible()) return;
    e.preventDefault();
    e.stopPropagation();
    graphInitialPinchZoom = graphInstance.zoom();
}

function handleGraphGestureChange(e: GestureEvent) {
    if (!graphInstance || !isGraphOverlayVisible()) return;
    e.preventDefault();
    e.stopPropagation();
    if (classifyGraphGesture(e) !== "zoom") return;
    const point = graphGesturePoint(e);
    graphZoomAt(point.x, point.y, (graphInitialPinchZoom * e.scale) / graphInstance.zoom());
}

function handleGraphGestureEnd(e: GestureEvent) {
    if (!isGraphOverlayVisible()) return;
    e.preventDefault();
    e.stopPropagation();
}

function handleGraphTouchStart(e: TouchEvent) {
    if (!graphInstance || !isGraphOverlayVisible()) return;
    const pinch = getGraphTouchPinch(e.touches);
    if (!pinch) return;

    e.preventDefault();
    e.stopPropagation();
    graphInitialTouchDistance = pinch.distance;
    graphInitialTouchZoom = graphInstance.zoom();
}

function handleGraphTouchMove(e: TouchEvent) {
    if (!graphInstance || !isGraphOverlayVisible()) return;
    const pinch = getGraphTouchPinch(e.touches);
    if (!pinch || graphInitialTouchDistance <= 0) return;

    e.preventDefault();
    e.stopPropagation();
    graphZoomAt(
        pinch.centerX,
        pinch.centerY,
        (graphInitialTouchZoom * (pinch.distance / graphInitialTouchDistance)) / graphInstance.zoom()
    );
}

function handleGraphTouchEnd(e: TouchEvent) {
    if (!isGraphOverlayVisible() || e.touches.length >= 2) return;

    e.preventDefault();
    e.stopPropagation();
    graphInitialTouchDistance = 0;
}

function handleGraphNativeMagnify(event: { data?: unknown }) {
    if (!graphInstance || !isGraphOverlayVisible()) return;

    const rawData = Array.isArray(event.data) ? event.data[0] : event.data;
    const magnification = Number(rawData);
    const factor = getGraphNativeMagnifyZoomFactor(magnification);
    if (factor === 1) return;

    const point = graphGesturePoint(new Event("obails:graph-magnify"));
    graphZoomAt(point.x, point.y, factor);
}

function renderGraph(
    graph: Graph,
    container: HTMLElement,
    savedPositions?: { [id: string]: { x: number; y: number } },
    savedViewState?: { zoom: number; centerX: number; centerY: number }
) {
    // Clean up existing instance
    graphInteractionAbortController?.abort();
    graphInteractionAbortController = null;
    if (graphInstance) {
        graphInstance._destructor();
    }

    container.innerHTML = "";
    const reusablePositions = hasCompleteGraphPositions(graph, savedPositions) ? savedPositions : undefined;

    // Prepare data for force-graph with restored positions
    // Note: Backend already filters to markdown-only nodes and edges
    const nodes: GraphNodeData[] = graph.nodes.map(n => {
        const pos = reusablePositions?.[n.id];
        return {
            id: n.id,
            label: n.label,
            linkCount: n.linkCount,
            // Restore position if available
            ...(pos && { x: pos.x, y: pos.y, fx: pos.x, fy: pos.y })
        };
    });

    const links: GraphEdgeData[] = graph.edges.map(e => ({
        source: e.source,
        target: e.target
    }));

    const width = container.clientWidth;
    const height = container.clientHeight;
    const hasSavedLayout = Boolean(reusablePositions);
    const isLargeGraph = nodes.length >= 1000;

    // Space/cosmic color scheme
    const isDark = isDarkTheme(getAppliedTheme());

    const nodeColor = isDark ? "#9d8cff" : "#6366f1"; // Purple/indigo
    const linkColor = isDark ? "rgba(147, 197, 253, 0.3)" : "rgba(99, 102, 241, 0.4)";
    const textColor = isDark ? "#e2e8f0" : "#1e293b";
    const highlightColor = "#f472b6"; // Pink for highlight

    // Create the force graph - simple version for large graphs
    graphInstance = ForceGraph()(container)
        .width(width)
        .height(height)
        .graphData({ nodes, links })
        .nodeId("id")
        .nodeLabel("label")
        .nodeColor(() => nodeColor)
        .nodeVal((node: GraphNodeData) => getNodeRadius(node))
        .nodeCanvasObjectMode(() => "replace")
        .nodeCanvasObject((node: GraphNodeData, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const radius = getGraphRenderedNodeRadius(node.linkCount, globalScale, isLargeGraph);
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = nodeColor;
            ctx.fill();

            if (!shouldShowGraphNodeLabel(node.linkCount, globalScale, isLargeGraph)) return;

            const fontSize = getGraphLabelFontSize(globalScale, isLargeGraph);
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = textColor;
            ctx.fillText(getGraphLabelText(node.label, isLargeGraph), node.x ?? 0, (node.y ?? 0) + radius + 2);
        })
        .linkSource("source")
        .linkTarget("target")
        .linkColor(() => linkColor)
        .linkWidth(0.3)
        .backgroundColor("transparent")
        .enablePanInteraction(true) // Enable mouse drag pan
        .enableZoomInteraction(false) // Disable default wheel zoom (we handle it custom)
        .enablePointerInteraction(true) // Enable pointer events
        .onNodeClick((node: GraphNodeData, event: MouseEvent) => {
            console.log("[Graph] Node clicked:", node.id, node.label);
            event.stopPropagation();
            hideGraphView();
            openNote(node.id);
        })
        .onNodeHover((node: GraphNodeData | null) => {
            container.style.cursor = node ? "pointer" : "grab";
        })
        .cooldownTicks(hasSavedLayout ? 0 : (isLargeGraph ? 260 : 120))
        .d3AlphaDecay(isLargeGraph ? 0.012 : 0.02)
        .d3VelocityDecay(isLargeGraph ? 0.36 : 0.3)
        .warmupTicks(hasSavedLayout ? 0 : (isLargeGraph ? 120 : 60));

    const chargeForce = graphInstance.d3Force("charge") as {
        strength: (value: number) => unknown;
        distanceMax?: (value: number) => unknown;
    } | undefined;
    chargeForce?.strength(isLargeGraph ? -28 : -55);
    chargeForce?.distanceMax?.(isLargeGraph ? 260 : 500);

    const linkForce = graphInstance.d3Force("link") as { distance: (value: number) => unknown } | undefined;
    linkForce?.distance(isLargeGraph ? 34 : 42);

    graphInstance.d3Force("graph-gravity", createCenterGravityForce(isLargeGraph ? 0.12 : 0.03));

    // Restore view state or zoom to fit
    setTimeout(() => {
        if (savedViewState && hasSavedLayout) {
            // Restore previous view state
            graphInstance?.zoom(savedViewState.zoom);
            graphInstance?.centerAt(savedViewState.centerX, savedViewState.centerY);
            // Release fixed positions after a short delay to allow dragging
            setTimeout(() => {
                const data = graphInstance?.graphData();
                if (data) {
                    for (const node of data.nodes as GraphNodeData[]) {
                        node.fx = undefined;
                        node.fy = undefined;
                    }
                }
            }, 100);
        } else {
            if (isLargeGraph) {
                const hub = getLargestHub(nodes);
                if (hub && Number.isFinite(hub.x) && Number.isFinite(hub.y)) {
                    graphInstance?.centerAt(hub.x ?? 0, hub.y ?? 0, 600);
                    graphInstance?.zoom(1.35, 600);
                } else {
                    graphInstance?.zoomToFit(400, 50);
                }
            } else {
                // Zoom to fit for small graphs
                graphInstance?.zoomToFit(400, 50);
            }
        }
    }, 100);

    graphInteractionAbortController = new AbortController();
    const graphInteractionSignal = graphInteractionAbortController.signal;

    // Capture on document because Wails/WebKit can dispatch macOS pinch gestures
    // above the canvas container instead of directly on it.
    document.addEventListener("wheel", handleGraphWheel, { passive: false, capture: true, signal: graphInteractionSignal });
    document.addEventListener("gesturestart", handleGraphGestureStart as EventListener, { passive: false, capture: true, signal: graphInteractionSignal });
    document.addEventListener("gesturechange", handleGraphGestureChange as EventListener, { passive: false, capture: true, signal: graphInteractionSignal });
    document.addEventListener("gestureend", handleGraphGestureEnd as EventListener, { passive: false, capture: true, signal: graphInteractionSignal });
    document.addEventListener("touchstart", handleGraphTouchStart, { passive: false, capture: true, signal: graphInteractionSignal });
    document.addEventListener("touchmove", handleGraphTouchMove, { passive: false, capture: true, signal: graphInteractionSignal });
    document.addEventListener("touchend", handleGraphTouchEnd, { passive: false, capture: true, signal: graphInteractionSignal });
    document.addEventListener("touchcancel", handleGraphTouchEnd, { passive: false, capture: true, signal: graphInteractionSignal });
    document.addEventListener("obails:graph-magnify", (event) => {
        handleGraphNativeMagnify({ data: (event as CustomEvent).detail });
    }, { signal: graphInteractionSignal });
}

// GestureEvent type for macOS Safari
interface GestureEvent extends UIEvent {
    scale: number;
    rotation: number;
}

// Mermaid Setup
function setupMermaid() {
    initializeMermaid(getAppliedTheme());
}

function initializeMermaid(theme: string) {
    const isDark = isDarkTheme(theme);
    mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? "dark" : "default",
        securityLevel: "loose",
        logLevel: "error",
        flowchart: {
            htmlLabels: false,
        },
    });
}

// Mermaid Fullscreen State
let mermaidZoom = 1;
let mermaidInitialZoom = 1;
let mermaidPanX = 0, mermaidPanY = 0;
let isMermaidPanning = false;
let mermaidStartX = 0, mermaidStartY = 0;
let mermaidSvgWidth = 0, mermaidSvgHeight = 0;
let mermaidMinimapScale = 1;
let mermaidRenderVersion = 0;
const mermaidRenderVersions = new WeakMap<HTMLElement, number>();

async function initMermaidDiagrams(previewEl: HTMLElement | null = document.getElementById("preview")) {
    if (!previewEl) return;
    const renderVersion = ++mermaidRenderVersion;
    mermaidRenderVersions.set(previewEl, renderVersion);

    await document.fonts.ready;
    if (mermaidRenderVersions.get(previewEl) !== renderVersion) return;

    const codeBlocks = previewEl.querySelectorAll("pre code");

    for (let idx = 0; idx < codeBlocks.length; idx++) {
        const code = codeBlocks[idx];
        const pre = code.parentElement;
        if (!pre) continue;

        const text = code.textContent?.trim() || "";

        // Check if it's mermaid content
        const isMermaid = code.classList.contains("language-mermaid") ||
            text.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline)/);

        if (!isMermaid) continue;
        if (!pre.isConnected || code.textContent?.trim() !== text) continue;

        // Create container
        const container = document.createElement("div");
        container.className = "mermaid-container";

        try {
            // Render mermaid diagram individually to catch errors per diagram
            const { svg } = await mermaid.render(`mermaid-${renderVersion}-${idx}`, text);
            if (mermaidRenderVersions.get(previewEl) !== renderVersion || !pre.isConnected || code.textContent?.trim() !== text) {
                continue;
            }

            const mermaidDiv = document.createElement("div");
            mermaidDiv.className = "mermaid";
            mermaidDiv.innerHTML = svg;
            mermaidDiv.title = "Click to view fullscreen";

            container.addEventListener("click", () => openMermaidFullscreen(mermaidDiv));
            container.appendChild(mermaidDiv);
        } catch (err: unknown) {
            // Show error inline below the code block (copyable)
            const errorDiv = document.createElement("div");
            errorDiv.className = "mermaid-error-inline";
            const errorMessage = err instanceof Error ? err.message : String(err);
            errorDiv.innerHTML = `
                <div class="mermaid-error-header">⚠️ Mermaid Syntax Error</div>
                <pre class="mermaid-error-text">${escapeHtml(errorMessage)}</pre>
            `;
            container.appendChild(errorDiv);
        }

        if (mermaidRenderVersions.get(previewEl) === renderVersion && pre.isConnected) {
            pre.replaceWith(container);
        }
    }
}

// Escape HTML for safe display
function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function openMermaidFullscreen(mermaidEl: HTMLElement) {
    const svg = mermaidEl.querySelector("svg");
    if (!svg) return;

    const fsOverlay = document.getElementById("mermaid-fullscreen")!;
    const fsWrapper = document.getElementById("mermaid-fs-wrapper")!;
    const fsContent = document.getElementById("mermaid-fs-content")!;
    const minimapContent = document.getElementById("mermaid-minimap-content")!;

    // Clone SVG
    fsWrapper.innerHTML = "";
    const clonedSvg = svg.cloneNode(true) as SVGElement;
    fsWrapper.appendChild(clonedSvg);

    // Setup minimap
    minimapContent.innerHTML = "";
    const minimapSvg = svg.cloneNode(true) as SVGElement;
    minimapContent.appendChild(minimapSvg);

    // Get SVG natural size
    const viewBox = svg.getAttribute("viewBox");
    let naturalWidth: number, naturalHeight: number;

    if (viewBox) {
        const parts = viewBox.split(/[\s,]+/);
        naturalWidth = parseFloat(parts[2]) || 800;
        naturalHeight = parseFloat(parts[3]) || 600;
    } else {
        naturalWidth = parseFloat(svg.getAttribute("width") || "") || svg.getBoundingClientRect().width || 800;
        naturalHeight = parseFloat(svg.getAttribute("height") || "") || svg.getBoundingClientRect().height || 600;
    }

    mermaidSvgWidth = naturalWidth;
    mermaidSvgHeight = naturalHeight;

    // Calculate minimap scale
    mermaidMinimapScale = calculateMinimapScale(naturalWidth, naturalHeight);

    clonedSvg.style.width = naturalWidth + "px";
    clonedSvg.style.height = naturalHeight + "px";

    // Calculate fit-to-viewport zoom
    const viewportHeight = window.innerHeight - 80;
    const viewportWidth = window.innerWidth - 40;

    const fitZoom = calculateFitZoom(naturalWidth, naturalHeight, viewportWidth, viewportHeight);
    mermaidZoom = fitZoom;
    mermaidInitialZoom = fitZoom;

    // Center the SVG
    const centered = calculateCenteredPosition(naturalWidth, naturalHeight, viewportWidth, viewportHeight, mermaidZoom);
    mermaidPanX = centered.x;
    mermaidPanY = centered.y;

    fsOverlay.classList.add("visible");
    updateMermaidTransform();
}

function closeMermaidFullscreen() {
    document.getElementById("mermaid-fullscreen")!.classList.remove("visible");
}

function updateMermaidTransform() {
    const fsWrapper = document.getElementById("mermaid-fs-wrapper")!;
    const zoomInfo = document.getElementById("mermaid-zoom-info")!;

    fsWrapper.style.transform = `translate(${mermaidPanX}px, ${mermaidPanY}px) scale(${mermaidZoom})`;
    zoomInfo.textContent = Math.round(mermaidZoom * 100) + "%";
    updateMermaidMinimap();
}

function updateMermaidMinimap() {
    if (!mermaidSvgWidth || !mermaidSvgHeight) return;

    const fsContent = document.getElementById("mermaid-fs-content")!;
    const viewport = document.getElementById("mermaid-minimap-viewport")!;

    const viewportWidth = fsContent.clientWidth;
    const viewportHeight = fsContent.clientHeight;

    const mmWidth = 184;
    const mmHeight = 134;
    const mmPadding = 8;

    const mmSvgWidth = mermaidSvgWidth * mermaidMinimapScale;
    const mmSvgHeight = mermaidSvgHeight * mermaidMinimapScale;
    const mmSvgLeft = (mmWidth - mmSvgWidth) / 2 + mmPadding;
    const mmSvgTop = (mmHeight - mmSvgHeight) / 2 + mmPadding;

    const svgVisibleLeft = -mermaidPanX / mermaidZoom;
    const svgVisibleTop = -mermaidPanY / mermaidZoom;
    const svgVisibleWidth = viewportWidth / mermaidZoom;
    const svgVisibleHeight = viewportHeight / mermaidZoom;

    let vpLeft = mmSvgLeft + svgVisibleLeft * mermaidMinimapScale;
    let vpTop = mmSvgTop + svgVisibleTop * mermaidMinimapScale;
    let vpWidth = svgVisibleWidth * mermaidMinimapScale;
    let vpHeight = svgVisibleHeight * mermaidMinimapScale;

    // Clamp to minimap bounds
    vpLeft = Math.max(mmPadding, vpLeft);
    vpTop = Math.max(mmPadding, vpTop);
    vpWidth = Math.max(20, Math.min(mmWidth, vpWidth));
    vpHeight = Math.max(15, Math.min(mmHeight, vpHeight));

    viewport.style.left = vpLeft + "px";
    viewport.style.top = vpTop + "px";
    viewport.style.width = vpWidth + "px";
    viewport.style.height = vpHeight + "px";
}

function mermaidZoomAt(factor: number, clientX: number, clientY: number) {
    const fsContent = document.getElementById("mermaid-fs-content")!;
    const oldZoom = mermaidZoom;
    mermaidZoom = clampZoom(mermaidZoom, factor);

    const rect = fsContent.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const zoomRatio = mermaidZoom / oldZoom;
    const newPan = calculateZoomPan(mouseX, mouseY, mermaidPanX, mermaidPanY, zoomRatio);
    mermaidPanX = newPan.x;
    mermaidPanY = newPan.y;

    updateMermaidTransform();
}

function setupMermaidFullscreenControls() {
    const fsOverlay = document.getElementById("mermaid-fullscreen")!;
    const fsContent = document.getElementById("mermaid-fs-content")!;

    // Zoom controls
    document.getElementById("mermaid-zoom-in")!.addEventListener("click", () => {
        const rect = fsContent.getBoundingClientRect();
        mermaidZoomAt(1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });

    document.getElementById("mermaid-zoom-out")!.addEventListener("click", () => {
        const rect = fsContent.getBoundingClientRect();
        mermaidZoomAt(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });

    document.getElementById("mermaid-reset")!.addEventListener("click", () => {
        mermaidZoom = mermaidInitialZoom;
        const viewportHeight = window.innerHeight - 80;
        const viewportWidth = window.innerWidth - 40;
        const centered = calculateCenteredPosition(mermaidSvgWidth, mermaidSvgHeight, viewportWidth, viewportHeight, mermaidZoom);
        mermaidPanX = centered.x;
        mermaidPanY = centered.y;
        updateMermaidTransform();
    });

    document.getElementById("mermaid-close")!.addEventListener("click", closeMermaidFullscreen);

    // Window maximize button
    document.getElementById("mermaid-maximize-window")!.addEventListener("click", async () => {
        try {
            await WindowService.ToggleMaximise();
        } catch (err) {
            console.error("Failed to toggle maximize:", err);
        }
    });

    // Pan with mouse drag
    fsContent.addEventListener("mousedown", (e) => {
        isMermaidPanning = true;
        fsContent.classList.add("panning");
        mermaidStartX = e.clientX - mermaidPanX;
        mermaidStartY = e.clientY - mermaidPanY;
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isMermaidPanning) return;
        mermaidPanX = e.clientX - mermaidStartX;
        mermaidPanY = e.clientY - mermaidStartY;
        updateMermaidTransform();
    });

    document.addEventListener("mouseup", () => {
        isMermaidPanning = false;
        fsContent.classList.remove("panning");
    });

    // Figma-style: Two-finger scroll = pan, Pinch = zoom
    fsContent.addEventListener("wheel", (e) => {
        if (!fsOverlay.classList.contains("visible")) return;
        e.preventDefault();

        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            // Pinch gesture (macOS trackpad sends ctrlKey=true for pinch)
            const factor = e.deltaY > 0 ? 0.95 : 1.05;
            mermaidZoomAt(factor, e.clientX, e.clientY);
        } else {
            // Two-finger scroll = pan
            mermaidPanX -= e.deltaX;
            mermaidPanY -= e.deltaY;
            updateMermaidTransform();
        }
    }, { passive: false });

    // ESC to close
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && fsOverlay.classList.contains("visible")) {
            closeMermaidFullscreen();
        }
    });
}

// Start
setupMermaid();
init();
setupMermaidFullscreenControls();
