import * as ConfigService from "../bindings/github.com/kazuph/obails/services/configservice.js";
import * as FileService from "../bindings/github.com/kazuph/obails/services/fileservice.js";
import * as NoteService from "../bindings/github.com/kazuph/obails/services/noteservice.js";
import * as LinkService from "../bindings/github.com/kazuph/obails/services/linkservice.js";
import * as WindowService from "../bindings/github.com/kazuph/obails/services/windowservice.js";
import * as GraphService from "../bindings/github.com/kazuph/obails/services/graphservice.js";
import * as StateService from "../bindings/github.com/kazuph/obails/services/stateservice.js";
import * as TranscribeService from "../bindings/github.com/kazuph/obails/services/transcribeservice.js";
import { FileInfo, Note, Timeline, Backlink, Link, Config, Graph } from "../bindings/github.com/kazuph/obails/models/models.js";
import { Clipboard, Events } from "@wailsio/runtime";
import mermaid from "mermaid";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";
import ForceGraph from "force-graph";
import { debounce } from "./lib/utils";
import {
  DEFAULT_THEME,
  VALID_THEMES,
  getAppliedTheme,
  isDarkTheme,
  normalizeThemeValue,
  resolveThemeSelection,
} from "./lib/theme";
import { parseMarkdown } from "./lib/markdown";
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
  extractExternalDropPaths,
  getDisplayName,
  hasExternalFileDrop,
  normalizeAndSortFileTree,
  shouldIgnoreTreeClick,
  type ItemKind,
} from "./lib/file-tree-ops";
import { renderIcon, setButtonIcon, type IconName } from "./lib/icons";
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
let currentFilePath: string | null = null;  // Tracks the open main-pane file (md, image, pdf, html)
let currentAudioPath: string | null = null;
let latestFileTree: FileInfo[] = [];
let audioLoopMode: AudioLoopMode = loadAudioLoopMode(window.localStorage);
let doneAudioPaths: Set<string> = loadDoneAudioPaths(window.localStorage);
let appThemeFromConfig: string | null = null;
let showTimeline = false;
let showGraph = false;
let contextMenuTargetPath: string = "";
let contextMenuTargetIsDir: boolean = false;
let draggedFilePath: string | null = null;
let graphInstance: ReturnType<typeof ForceGraph> | null = null;
let lastSyncedOpenedFile: string = "";
let fileTreeWatchTimerId: ReturnType<typeof window.setInterval> | null = null;
let isFileTreeWatchRunning = false;
let fileTreeSignature = "";
let suppressFileTreeClickUntil = 0;
let suppressFileTreeClickPath = "";
let suppressContextMenuDismissUntil = 0;
let lastContextMenuX = 0;
let lastContextMenuY = 0;
let graphInteractionAbortController: AbortController | null = null;
let graphInitialPinchZoom = 1;
let graphInitialTouchDistance = 0;
let graphInitialTouchZoom = 1;
let pendingDeleteTargetPath = "";
let pendingDeleteIsDir = false;
let itemFormMode: "create" | "rename" = "create";
let itemFormKind: ItemKind = "file";
let itemFormTargetPath = "";
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

// DOM Elements
const fileTree = document.getElementById("file-tree")!;
const editor = document.getElementById("editor") as HTMLTextAreaElement;
const preview = document.getElementById("preview")!;
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
const fileSearchInput = document.getElementById("file-search-input") as HTMLInputElement;
const fileSearchClear = document.getElementById("file-search-clear")!;
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

// Initialize
async function init() {
    try {
        const config = await ConfigService.GetConfig();
        appThemeFromConfig = normalizeThemeValue(config?.UI?.Theme || "");
        if (config?.Vault?.Path) {
            await loadFileTree();

            // Open last file if exists (from vault state)
            const lastFile = await StateService.GetLastOpenedFile();
            if (lastFile) {
                const resolvedType = resolveFileType(lastFile.fileType, lastFile.path);
                try {
                    await openFile(lastFile.path, resolvedType);
                    lastSyncedOpenedFile = toStateKey(lastFile.path, resolvedType);
                } catch {
                    // File might have been deleted, clear the state
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

    setupEventListeners();
    setupToolbarIcons();
    setupWindowFocusBreathing();
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
    setButtonIcon(document.getElementById("refresh-btn")!, "refresh");
    setButtonIcon(document.getElementById("source-toggle-btn")!, "code");
    setButtonIcon(document.getElementById("collapse-all-folders-btn")!, "folder-closed");
    setButtonIcon(document.getElementById("expand-all-folders-btn")!, "folder-open");
    setButtonIcon(document.getElementById("mini-player-close")!, "close");

    const miniPlayerIcon = document.querySelector(".mini-player-icon") as HTMLElement | null;
    if (miniPlayerIcon) {
        miniPlayerIcon.innerHTML = renderIcon("music");
    }

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
            const files = normalizeAndSortFileTree(await FileService.ListDirectoryTree());
            const nextSignature = buildFileTreeSignature(files);

            if (fileTreeSignature === nextSignature) {
                await syncOpenFileWithVault();
                return;
            }

            applyFileTreeSnapshot(files);
            await LinkService.RebuildIndex();
            await syncOpenFileWithVault();

            if (showGraph) {
                await refreshGraphData();
            }
        } catch (err) {
            console.warn("Failed to watch file tree updates:", err);
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
            parts.push(`${file.path}|${file.isDir ? "1" : "0"}|${file.fileType || ""}|${modifiedAt}`);

            if (file.children && file.children.length > 0) {
                walk(file.children);
            }
        }
    };

    walk(files);
    return parts.join("\n");
}

function restoreActiveFileTreeSelection() {
    if (currentFilePath) {
        // Snapshot restore (watcher refresh etc.) must not undo user-collapsed folders.
        updateFileTreeSelection(currentFilePath, { reveal: false });
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
    if (options.revealActiveFile !== false) {
        restoreActiveFileTreeSelection();
    }
    syncAudioPlaybackBadges();
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
    paths.forEach((path) => {
        const folder = fileTree.querySelector(`.file-item.folder[data-path="${path}"]`);
        if (folder instanceof HTMLElement) {
            setFolderExpanded(folder, true);
        }
    });
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
            await loadFileTree();
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

// Source editor visibility (default: preview only, < > toggles the source pane)
function toggleSourceEditor() {
    const hidden = editorContainer.classList.toggle("source-hidden");
    const btn = document.getElementById("source-toggle-btn");
    if (btn) {
        btn.setAttribute("aria-pressed", hidden ? "false" : "true");
        btn.classList.toggle("active", !hidden);
    }
    if (!hidden) {
        editor.focus();
    }
}

// Event Listeners
function setupEventListeners() {
    document.getElementById("settings-btn")!.addEventListener("click", openSettings);
    document.getElementById("new-note-btn")!.addEventListener("click", showNewNoteForm);
    document.getElementById("daily-note-btn")!.addEventListener("click", openTodayNote);
    document.getElementById("timeline-btn")!.addEventListener("click", toggleTimeline);
    document.getElementById("graph-btn")!.addEventListener("click", toggleGraphView);
    document.getElementById("refresh-btn")!.addEventListener("click", refresh);
    document.getElementById("source-toggle-btn")!.addEventListener("click", toggleSourceEditor);
    document.getElementById("graph-relayout")!.addEventListener("click", refreshGraphData);
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
    setupDeleteConfirmDialog();

    // Graph overlay close button
    document.getElementById("graph-close")!.addEventListener("click", hideGraphView);

    // New note form events
    document.getElementById("new-note-create")!.addEventListener("click", createNewNote);
    document.getElementById("new-note-cancel")!.addEventListener("click", hideNewNoteForm);
    document.getElementById("new-note-input")!.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            createNewNote();
        } else if (e.key === "Escape") {
            hideNewNoteForm();
        }
    });

    editor.addEventListener("input", debounce(saveEditorContent, 500));
    editor.addEventListener("input", updatePreview);
    preview.addEventListener("scroll", updateActiveOutlineFromPreview);

    // HTML Editor events
    htmlEditor.addEventListener("input", debounce(saveHtmlFile, 500));
    htmlEditor.addEventListener("input", updateHtmlPreview);

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
    document.getElementById("editor-title")!.addEventListener("click", () => {
        if (currentFilePath) {
            showRenameForm(currentFilePath, false);
        }
    });

    // Handle external links in preview - open in external browser
    setupPreviewInteractions();
    preview.addEventListener("click", async (e) => {
        const target = e.target as HTMLElement;
        const link = target.closest("a");
        if (link) {
            const href = link.getAttribute("href");
            if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
                e.preventDefault();
                e.stopPropagation();
                try {
                    await FileService.OpenURL(href);
                } catch (err) {
                    console.error("Failed to open external link:", err);
                }
            }
        }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        // Show shortcuts help with "?" key (when not typing in an input)
        if (e.key === "?" && !isInputFocused()) {
            e.preventDefault();
            toggleShortcutsHelp();
            return;
        }
        if (isModKey(e) && e.key === ",") {
            e.preventDefault();
            openSettings();
        }
        if (isModKey(e) && e.key === "n") {
            e.preventDefault();
            showNewNoteForm();
        }
        if (isModKey(e) && e.key === "g") {
            e.preventDefault();
            toggleGraphView();
        }
        if (isModKey(e) && e.key === "e") {
            e.preventDefault();
            toggleSourceEditor();
        }
        // ESC to close overlays (skip if file tree is focused - handled separately)
        if (e.key === "Escape" && !fileTreeFocused) {
            const shortcutsOverlay = document.getElementById("shortcuts-overlay");
            const deleteConfirmOverlay = document.getElementById("delete-confirm-overlay");
            if (!noteSearch.hidden) {
                closeNoteSearch();
            } else if (shortcutsOverlay?.classList.contains("visible")) {
                hideShortcutsHelp();
            } else if (deleteConfirmOverlay?.style.display !== "none") {
                hideDeleteConfirmDialog();
            } else if (pdfIsFullscreen) {
                closePdfFullscreen();
            } else if (imageFullscreenOverlay.style.display !== "none") {
                closeImageFullscreen();
            } else if (showGraph) {
                hideGraphView();
            }
            hideContextMenu();
        }
        // Cmd+P (Quick Open) to focus file search
        if (isModKey(e) && e.key === "p") {
            e.preventDefault();
            fileSearchInput.focus();
            fileSearchInput.select();
        }
        // Cmd+F (or Ctrl+F on non-Mac) to search within the current note preview.
        if (isModKey(e) && e.key === "f") {
            e.preventDefault();
            openNoteSearch();
        }
    });

    setupResizeHandles();
    setupRightSidebarLayoutControls();
    setupThemeMenu();
    setupContextMenu();
    setupFileTreeDropTarget();
    setupFolderTreeControls();
    setupFileSearch();
    setupNoteSearch();
    setupFileTreeKeyboardNavigation();
    setupShortcutsHelp();
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
        if (!draggedFilePath && !hasExternalFileDrop(e.dataTransfer)) {
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
    document.getElementById("collapse-all-folders-btn")!.addEventListener("click", () => {
        setAllFoldersExpanded(false);
    });
    document.getElementById("expand-all-folders-btn")!.addEventListener("click", () => {
        setAllFoldersExpanded(true);
    });
}

function setFolderExpanded(folderItem: HTMLElement, expanded: boolean) {
    folderItem.classList.toggle("expanded", expanded);
    const iconSpan = folderItem.querySelector(".folder-icon");
    if (iconSpan) {
        iconSpan.innerHTML = renderIcon(expanded ? "folder-open" : "folder-closed");
    }

    const wrapper = folderItem.parentElement;
    const childrenEl = wrapper?.querySelector(":scope > .folder-children") as HTMLElement | null;
    if (childrenEl) {
        childrenEl.style.display = expanded ? "block" : "none";
    }
}

function setAllFoldersExpanded(expanded: boolean) {
    fileTree.querySelectorAll(".file-item.folder").forEach((folder) => {
        setFolderExpanded(folder as HTMLElement, expanded);
    });
}

async function handleFileTreeDrop(e: DragEvent, targetFolder: string) {
    if (draggedFilePath) {
        e.preventDefault();
        e.stopPropagation();
        await moveFileToFolder(draggedFilePath, targetFolder);
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

    for (const sourcePath of sourcePaths) {
        try {
            const relativePath = await FileService.ImportExternalFile(sourcePath, targetFolder);
            importedPaths.push(relativePath);
        } catch (err) {
            console.error("Failed to import external file:", err);
            alert(`Failed to import file: ${err}`);
        }
    }

    if (importedPaths.length === 0) {
        return;
    }

    await loadFileTree({ revealActiveFile: false });
    const lastImported = importedPaths[importedPaths.length - 1];
    updateFileTreeSelection(lastImported, { reveal: false });

    const fileType = getFileTypeFromPath(lastImported);
    if (fileType === "markdown") {
        await openNote(lastImported);
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
                alert(`Failed to import file: ${err}`);
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
            alert(`Failed to import file: ${err}`);
        }
    }

    if (importedPaths.length === 0) {
        return;
    }

    await loadFileTree({ revealActiveFile: false });
    const lastImported = importedPaths[importedPaths.length - 1];
    updateFileTreeSelection(lastImported, { reveal: false });
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

        // Ctrl+N: Move selection down
        if (e.ctrlKey && e.key === "n") {
            e.preventDefault();
            moveSearchSelection(1);
            return;
        }

        // Ctrl+P: Move selection up
        if (e.ctrlKey && e.key === "p") {
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
        // Show all items and collapse folders to original state
        allFileItems.forEach(item => {
            item.classList.remove("search-hidden", "search-match");
        });
        allFolderWrappers.forEach(wrapper => {
            wrapper.classList.remove("search-hidden");
        });
        return;
    }

    // Track which folders have matching children
    const foldersWithMatches = new Set<Element>();

    // First pass: mark matching files and collect parent folders
    allFileItems.forEach(item => {
        const fileName = item.getAttribute("data-name") || item.textContent || "";
        const isMatch = fileName.toLowerCase().includes(query);

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

function updateKeyboardSelection(newIndex: number) {
    const visibleItems = getVisibleFileItems();
    if (visibleItems.length === 0) return;

    // Remove previous keyboard selection
    document.querySelectorAll(".file-item.keyboard-selected").forEach(el => {
        el.classList.remove("keyboard-selected");
    });

    // Clamp index
    keyboardSelectedIndex = Math.max(0, Math.min(newIndex, visibleItems.length - 1));

    // Apply keyboard selection
    const selectedItem = visibleItems[keyboardSelectedIndex];
    if (selectedItem) {
        selectedItem.classList.add("keyboard-selected");
        selectedItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
            e.preventDefault();
            updateKeyboardSelection(keyboardSelectedIndex + 1);
            break;

        case "k":
            e.preventDefault();
            updateKeyboardSelection(keyboardSelectedIndex - 1);
            break;

        case "l":
            e.preventDefault();
            if (currentItem?.classList.contains("folder")) {
                // Open folder if closed
                if (!currentItem.classList.contains("expanded")) {
                    currentItem.click();
                }
            }
            break;

        case "h":
            e.preventDefault();
            if (currentItem) {
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
        if (["j", "k", "h", "l", "Enter", "Escape"].includes(e.key)) {
            if (fileTreeFocused && !isInputFocused()) {
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
async function openSettings() {
    try {
        await ConfigService.OpenConfigFile();
    } catch (err) {
        console.error("Failed to open settings:", err);
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
                return;
            }

            const initialTitle = getDisplayName(relativePath, "file");
            const initialContent = `# ${initialTitle}\n\n`;
            await FileService.CreateFile(relativePath, initialContent);
            hideNewNoteForm();
            await loadFileTree();
            await openNote(relativePath);
            return;
        }

        const nextPath = buildRenamePath(itemFormTargetPath, enteredName, itemFormKind);
        if (nextPath === itemFormTargetPath) {
            hideNewNoteForm();
            return;
        }

        const previousPath = itemFormTargetPath;
        await FileService.MoveFile(previousPath, nextPath);
        hideNewNoteForm();

        updateCurrentPathsAfterMove(previousPath, nextPath, itemFormKind === "folder");
        await loadFileTree();
        updateFileTreeSelection(currentFilePath || nextPath);
        await LinkService.RebuildIndex();
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
    const ctxRename = document.getElementById("ctx-rename")!;
    const ctxDelete = document.getElementById("ctx-delete")!;

    const hideContextMenuOnOutsideInteraction = (event: Event) => {
        if (!isContextMenuVisible()) {
            return;
        }
        const target = event.target;
        if (
            Date.now() < suppressContextMenuDismissUntil &&
            event instanceof MouseEvent &&
            Math.abs(event.clientX - lastContextMenuX) < 4 &&
            Math.abs(event.clientY - lastContextMenuY) < 4
        ) {
            return;
        }
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

        if (!isDir && currentFilePath !== targetPath) {
            await openNote(targetPath);
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
}

function showContextMenu(x: number, y: number, path: string, isDir: boolean) {
    const contextMenu = document.getElementById("context-menu")!;
    const backdrop = document.getElementById("context-menu-backdrop")!;
    const ctxNewFile = document.getElementById("ctx-new-file")!;
    const ctxNewFolder = document.getElementById("ctx-new-folder")!;
    const ctxOpenFinder = document.getElementById("ctx-open-finder")!;
    const ctxOpenFile = document.getElementById("ctx-open-file")!;
    const ctxCopyPath = document.getElementById("ctx-copy-path")!;
    const ctxRename = document.getElementById("ctx-rename")!;
    const ctxDelete = document.getElementById("ctx-delete")!;
    const isRoot = path === "";

    contextMenuTargetPath = path;
    contextMenuTargetIsDir = isDir;
    suppressContextMenuDismissUntil = Date.now() + 250;
    lastContextMenuX = x;
    lastContextMenuY = y;

    ctxNewFile.style.display = "flex";
    ctxNewFolder.style.display = "flex";
    ctxOpenFinder.style.display = isDir && !isRoot ? "flex" : "none";
    ctxOpenFile.style.display = !isDir && !isRoot ? "flex" : "none";
    ctxCopyPath.style.display = isRoot ? "none" : "flex";
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
}

function hideContextMenu() {
    const contextMenu = document.getElementById("context-menu")!;
    const backdrop = document.getElementById("context-menu-backdrop")!;
    contextMenu.style.display = "none";
    backdrop.style.display = "none";
    contextMenuTargetPath = "";
    contextMenuTargetIsDir = false;
    suppressContextMenuDismissUntil = 0;
    lastContextMenuX = 0;
    lastContextMenuY = 0;
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

async function moveFileToFolder(sourcePath: string, targetFolder: string) {
    const fileName = sourcePath.split("/").pop();
    const newPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;

    if (sourcePath === newPath) return;

    try {
        await FileService.MoveFile(sourcePath, newPath!);
        await loadFileTree();

        updateCurrentPathsAfterMove(sourcePath, newPath!, false);
    } catch (err) {
        console.error("Failed to move file:", err);
        alert(`Failed to move file: ${err}`);
    }
}

async function deleteTargetPathWithArgs(targetPath: string, isDir: boolean) {
    if (!targetPath) return;

    const confirmed = await showDeleteConfirmDialog(targetPath, isDir);
    if (!confirmed) {
        return;
    }

    try {
        await FileService.DeletePath(targetPath);
        await loadFileTree();

        // If deleted file was currently open, clear editor
        if (currentFilePath && (currentFilePath === targetPath || currentFilePath.startsWith(`${targetPath}/`))) {
            clearCurrentSelection();
            await StateService.ClearLastOpenedFile();
        }
    } catch (err) {
        console.error("Failed to delete:", err);
        alert(`Failed to delete: ${err}`);
    }
}

function setupDeleteConfirmDialog() {
    const overlay = document.getElementById("delete-confirm-overlay")!;
    const cancelButton = document.getElementById("delete-confirm-cancel")!;
    const confirmButton = document.getElementById("delete-confirm-submit")!;

    cancelButton.addEventListener("click", hideDeleteConfirmDialog);
    confirmButton.addEventListener("click", async () => {
        const targetPath = pendingDeleteTargetPath;
        const isDir = pendingDeleteIsDir;
        hideDeleteConfirmDialog(true);
        await performDeleteTargetPath(targetPath, isDir);
    });

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            hideDeleteConfirmDialog();
        }
    });
}

function showDeleteConfirmDialog(targetPath: string, isDir: boolean): Promise<boolean> {
    pendingDeleteTargetPath = targetPath;
    pendingDeleteIsDir = isDir;

    const overlay = document.getElementById("delete-confirm-overlay")!;
    const message = document.getElementById("delete-confirm-message")!;
    const confirmButton = document.getElementById("delete-confirm-submit") as HTMLButtonElement;

    const itemType = isDir ? "folder" : "file";
    message.textContent = `Delete this ${itemType}? ${targetPath}`;
    confirmButton.focus();
    overlay.style.display = "flex";

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
    pendingDeleteTargetPath = "";
    pendingDeleteIsDir = false;
}

async function performDeleteTargetPath(targetPath: string, isDir: boolean) {
    if (!targetPath) {
        return;
    }

    try {
        await FileService.DeletePath(targetPath);
        await loadFileTree();

        if (currentFilePath && (currentFilePath === targetPath || currentFilePath.startsWith(`${targetPath}/`))) {
            clearCurrentSelection();
            await StateService.ClearLastOpenedFile();
        }
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

    applyTheme(selectedTheme, false);

    Events.On("obails:theme-selected", (event) => {
        applyTheme(String(event.data || ""), true);
    });

    window.addEventListener("obails:theme-selected", (event) => {
        const theme = (event as CustomEvent<string>).detail;
        applyTheme(theme, true);
    });

    Events.On("obails:files-dropped", (event) => {
        const data = event.data as { files?: string[]; targetFolder?: string } | null;
        const files = Array.isArray(data?.files) ? data.files : [];
        void importExternalFiles(files, data?.targetFolder || "");
    });
}

function applyTheme(themeValue: string, persist: boolean) {
    const theme = resolveThemeSelection(VALID_THEMES, themeValue, null, DEFAULT_THEME);
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("obails-theme", theme);

    if (persist) {
        ConfigService.SetTheme(theme).catch((err: unknown) => {
            console.warn("Failed to save theme to config:", err);
        });
    }

    initializeMermaid(theme);

    updatePreview();
}

function showEmptyMainPane() {
    editorContainer.style.display = "flex";
    editor.value = "";
    preview.innerHTML = "Select a note from the file tree.";
    updatePaneTitles("Select a note...");
    outlineList.innerHTML = '<div class="outline-empty">Headings you write will gather here</div>';
    currentNote = null;
    currentFilePath = null;
    currentHtmlPath = null;
    currentTextPath = null;
    lastLoadedMarkdownContent = "";
    lastLoadedHtmlContent = "";
    lastLoadedTextContent = "";
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
async function openFile(path: string, fileType: string): Promise<void> {
    const resolvedType = resolveFileType(fileType, path);
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

    // Save last opened file to vault state (for all supported types)
    if (resolvedType === "markdown" || resolvedType === "image" || resolvedType === "pdf" || resolvedType === "html" || resolvedType === "text") {
        try {
            await StateService.SetLastOpenedFile(path, resolvedType);
        } catch (err) {
            console.warn("Failed to persist last opened file:", err);
        }
    }

    // Clear outline for non-markdown files (outline is only relevant for markdown)
    if (resolvedType !== "markdown" && resolvedType !== "audio") {
        outlineList.innerHTML = '<div class="outline-empty">Headings you write will gather here</div>';
        currentNote = null;
    }

    switch (resolvedType) {
        case "markdown":
            opened = await openNote(path);
            if (!opened) {
                await StateService.ClearLastOpenedFile();
                lastSyncedOpenedFile = "";
                showEmptyMainPane();
                return;
            }
            currentFilePath = path;  // Track current file for refresh
            break;
        case "image":
            currentFilePath = path;
            await openImage(path);
            opened = true;
            break;
        case "pdf":
            currentFilePath = path;
            await openPDF(path);
            opened = true;
            break;
        case "html":
            currentFilePath = path;
            await openHTML(path);
            opened = true;
            break;
        case "text":
            currentFilePath = path;
            await openText(path);
            opened = true;
            break;
        case "audio":
            await openAudio(path);
            opened = true;
            break;
        default:
            opened = true;
            // Open with system default app (macOS open command)
            currentFilePath = path;
            await openExternal(path);
            break;
    }

    if (!opened) {
        showEmptyMainPane();
        throw new Error("Failed to open file.");
    }
}

// Hide all viewer panels
function hideAllViewers() {
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
function getCurrentPageFromScroll(container: HTMLElement): number {
    if (pdfCanvases.length === 0) return 1;

    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const scrollCenter = scrollTop + containerHeight / 3; // Use upper third as reference

    for (let i = 0; i < pdfCanvases.length; i++) {
        const canvas = pdfCanvases[i];
        const canvasTop = canvas.offsetTop;
        const canvasBottom = canvasTop + canvas.height;

        if (scrollCenter >= canvasTop && scrollCenter < canvasBottom) {
            return i + 1;
        }
    }

    return pdfTotalPages; // Default to last page if at bottom
}

// Scroll to specific page in continuous mode
function scrollToPage(container: HTMLElement, pageNum: number, canvases?: HTMLCanvasElement[]): void {
    const targetCanvases = canvases || pdfCanvases;
    const index = pageNum - 1;
    if (index >= 0 && index < targetCanvases.length) {
        const canvas = targetCanvases[index];
        container.scrollTo({
            top: canvas.offsetTop - 16, // Small offset for padding
            behavior: 'auto'
        });
    }
}

// PDF navigation functions (only for single page mode)
async function pdfPrevPage() {
    if (pdfViewMode === 'continuous' || pdfCurrentPage <= 1) return;
    pdfCurrentPage--;
    updatePdfInfo();
    await renderPdfPages();
}

async function pdfNextPage() {
    if (pdfViewMode === 'continuous' || pdfCurrentPage >= pdfTotalPages) return;
    pdfCurrentPage++;
    updatePdfInfo();
    await renderPdfPages();
}

async function pdfZoomIn() {
    pdfScale = Math.min(pdfScale * 1.25, 5.0);
    updatePdfInfo();
    await renderPdfPages();
}

async function pdfZoomOut() {
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

async function openHTML(path: string): Promise<void> {
    try {
        const content = await FileService.ReadFile(path);
        currentHtmlPath = path;
        currentTextPath = null;
        lastLoadedHtmlContent = content;

        htmlEditor.value = content;
        htmlEditorTitle.textContent = path.split('/').pop() || 'HTML';
        htmlEditorContainer.style.display = "flex";

        // Update preview
        updateHtmlPreview();

        // Update file tree selection
        updateFileTreeSelection(path);
    } catch (err) {
        console.error("Failed to open HTML:", err);
        alert(`Failed to open HTML: ${err}`);
    }
}

async function openText(path: string): Promise<void> {
    try {
        const content = await FileService.ReadFile(path);
        currentFilePath = path;
        currentTextPath = path;
        currentNote = null;
        currentHtmlPath = null;
        lastLoadedMarkdownContent = "";
        lastLoadedTextContent = content;

        editorContainer.style.display = "flex";
        editor.value = content;
        editor.selectionStart = 0;
        editor.selectionEnd = 0;
        editor.scrollTop = 0;
        updatePaneTitles(path.split('/').pop() || path);
        updatePreview();
        clearBacklinks();
        clearOutgoingLinks();
        updateFileTreeSelection(path);
    } catch (err) {
        console.error("Failed to open text file:", err);
        alert(`Failed to open text file: ${err}`);
    }
}

// Update HTML preview
function updateHtmlPreview() {
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

// Save HTML file
async function saveHtmlFile() {
    if (!currentHtmlPath) return;

    try {
        await FileService.WriteFile(currentHtmlPath, htmlEditor.value);
        lastLoadedHtmlContent = htmlEditor.value;
    } catch (err) {
        console.error("Failed to save HTML:", err);
    }
}

async function saveEditorContent() {
    if (currentTextPath) {
        await saveCurrentTextFile();
        return;
    }
    await saveCurrentNote();
}

// 保存の気配: 「保存しました」とは言わず、タイトル横の小さな点がふっと現れて消える
let savePulseTimerId: number | null = null;
function showSavePulse() {
    const pulse = document.getElementById("save-pulse");
    if (!pulse) return;

    pulse.classList.remove("visible");
    // 連続保存でもアニメーションを最初からやり直すための reflow
    void (pulse as HTMLElement).offsetWidth;
    pulse.classList.add("visible");

    if (savePulseTimerId !== null) {
        window.clearTimeout(savePulseTimerId);
    }
    savePulseTimerId = window.setTimeout(() => {
        pulse.classList.remove("visible");
        savePulseTimerId = null;
    }, 1200);
}

async function saveCurrentTextFile() {
    if (!currentTextPath) return;

    try {
        await FileService.WriteFile(currentTextPath, editor.value);
        lastLoadedTextContent = editor.value;
        showSavePulse();
    } catch (err) {
        console.error("Failed to save text file:", err);
    }
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
    if (options.reveal !== false) {
        expandParentFolders(path);
    }

    // Highlight the file
    const fileItem = document.querySelector(`.file-item[data-path="${path}"]`);
    if (fileItem) {
        fileItem.classList.add("active");
        // Delay scroll to ensure folder expansion is complete
        setTimeout(() => {
            fileItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 50);
    }
}

// Expand all parent folders for a given file path
function expandParentFolders(path: string) {
    const parts = path.split("/");
    let currentPath = "";

    // Iterate through path parts (excluding the file itself)
    for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];

        const folderItem = document.querySelector(`.file-item.folder[data-path="${currentPath}"]`);
        if (folderItem && !folderItem.classList.contains("expanded")) {
            // Expand the folder
            setFolderExpanded(folderItem as HTMLElement, true);
        }
    }
}

// File Tree
async function loadFileTree(options: FileTreeSnapshotOptions = {}) {
    try {
        const files = normalizeAndSortFileTree(await FileService.ListDirectoryTree());
        applyFileTreeSnapshot(files, options);
    } catch (err) {
        console.error("Failed to load file tree:", err);
        fileTree.innerHTML = '<div class="error">Failed to load files</div>';
    }
}

function renderFileTree(files: FileInfo[]) {
    fileTree.innerHTML = "";

    for (const file of files) {
        const el = createFileElement(file);
        fileTree.appendChild(el);
    }
}

function createFileElement(file: FileInfo): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "file-wrapper";

    const el = document.createElement("div");
    el.className = `file-item ${file.isDir ? "folder" : "file"}`;
    el.setAttribute("data-path", file.path);
    el.setAttribute("data-name", file.name);
    if (file.isDir) {
        el.setAttribute("data-file-drop-target", "");
    }

    const icon = getFileIcon(file);
    const badgeHTML = !file.isDir && resolveFileType(file.fileType || "", file.path) === "audio"
        ? '<span class="file-playback-badge" data-playback-badge hidden></span>'
        : "";
    el.innerHTML = `<span class="folder-icon">${icon}</span><span class="file-name">${file.name}</span>${badgeHTML}`;

    // Make files draggable (not folders for now)
    if (!file.isDir) {
        el.draggable = true;
        el.addEventListener("dragstart", (e) => {
            draggedFilePath = file.path;
            el.classList.add("dragging");
            e.dataTransfer?.setData("text/plain", file.path);
        });
        el.addEventListener("dragend", () => {
            el.classList.remove("dragging");
            draggedFilePath = null;
            document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
        });
    }

    wrapper.appendChild(el);

    if (file.isDir) {
        let childrenEl: HTMLElement | null = null;

        if (file.children && file.children.length > 0) {
            childrenEl = document.createElement("div");
            childrenEl.className = "folder-children";
            childrenEl.style.display = "none";
            for (const child of file.children) {
                childrenEl.appendChild(createFileElement(child));
            }
            wrapper.appendChild(childrenEl);
        }

        el.addEventListener("click", (e) => {
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
            suppressFileTreeClickPath = file.path;
            suppressFileTreeClickUntil = Date.now() + 300;
            showContextMenu(e.clientX, e.clientY, file.path, true);
        });

        // Drop target for drag & drop
        el.addEventListener("dragover", (e) => {
            if (!draggedFilePath && !hasExternalFileDrop(e.dataTransfer)) {
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
            if (draggedFilePath === file.path) {
                return;
            }
            await handleFileTreeDrop(e, file.path);
        });
    } else {
        // Handle file click based on file type
        el.addEventListener("click", (e) => {
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
            suppressFileTreeClickPath = file.path;
            suppressFileTreeClickUntil = Date.now() + 300;
            showContextMenu(e.clientX, e.clientY, file.path, false);
        });
    }

    return wrapper;
}

// Note Operations
async function openNote(path: string): Promise<boolean> {
    showTimeline = false;
    hideAllViewers();
    editorContainer.style.display = "flex";

    try {
        currentNote = await NoteService.GetNote(path);
        if (!currentNote) {
            throw new Error(`note not found: ${path}`);
        }

        currentFilePath = path;
        currentTextPath = null;
        currentHtmlPath = null;
        lastLoadedTextContent = "";
        editor.value = currentNote.content;
        lastLoadedMarkdownContent = currentNote.content;
        // Reset cursor position and scroll to the top
        editor.selectionStart = 0;
        editor.selectionEnd = 0;
        editor.scrollTop = 0;
        updatePreview();

        await Promise.allSettled([
            loadBacklinks(path),
            loadOutgoingLinks(path),
        ]);

        // Save to vault state (also saves when called directly from backlinks/outgoing links/graph)
        try {
            await StateService.SetLastOpenedFile(path, "markdown");
        } catch (err) {
            console.warn("Failed to persist last opened file:", err);
        }

        // Update pane titles (remove .md extension)
        const filename = path.split("/").pop()?.replace(/\.md$/i, "") || path;
        updatePaneTitles(filename);

        // Update file tree selection
        updateFileTreeSelection(path);
        return true;
    } catch (err) {
        console.error("Failed to open note:", err);
        showEmptyMainPane();
        return false;
    }
}

// Update editor and preview pane titles
function updatePaneTitles(title: string) {
    const editorTitle = document.getElementById("editor-title");
    const previewTitle = document.getElementById("preview-title");
    if (editorTitle) editorTitle.textContent = title;
    if (previewTitle) previewTitle.textContent = title;
}

function updateCurrentPathsAfterMove(previousPath: string, nextPath: string, isDir: boolean) {
    const rewritePath = (path: string | null): string | null => {
        if (!path) return path;
        if (path === previousPath) {
            return nextPath;
        }
        if (isDir && path.startsWith(`${previousPath}/`)) {
            return `${nextPath}${path.slice(previousPath.length)}`;
        }
        return path;
    };

    currentFilePath = rewritePath(currentFilePath);
    currentHtmlPath = rewritePath(currentHtmlPath);
    currentTextPath = rewritePath(currentTextPath);
    currentAudioPath = rewritePath(currentAudioPath);
    if (currentNote?.path) {
        currentNote.path = rewritePath(currentNote.path) || currentNote.path;
    }

    if (currentFilePath) {
        const fileType = getFileTypeFromPath(currentFilePath);
        lastSyncedOpenedFile = toStateKey(currentFilePath, fileType);
        void StateService.SetLastOpenedFile(currentFilePath, fileType).catch((err) => {
            console.warn("Failed to persist moved path:", err);
        });
        if (fileType === "markdown") {
            updatePaneTitles(getDisplayName(currentFilePath, "file"));
        } else if (fileType === "html") {
            htmlEditorTitle.textContent = currentFilePath.split("/").pop() || "HTML";
        }
    }
    if (currentAudioPath) {
        miniPlayerTitle.textContent = currentAudioPath.split("/").pop() || "Audio";
    }
}

function clearCurrentSelection() {
    hideAllViewers();
    editorContainer.style.display = "flex";
    currentNote = null;
    currentFilePath = null;
    currentHtmlPath = null;
    currentTextPath = null;
    lastLoadedMarkdownContent = "";
    lastLoadedHtmlContent = "";
    lastLoadedTextContent = "";
    lastSyncedOpenedFile = "";
    editor.value = "";
    editor.selectionStart = 0;
    editor.selectionEnd = 0;
    editor.scrollTop = 0;
    updatePreview();
    clearBacklinks();
    clearOutgoingLinks();
    updatePaneTitles("Select a note...");
}

async function saveCurrentNote() {
    if (!currentNote) return;

    try {
        await NoteService.SaveNote(currentNote.path, editor.value);
        currentNote.content = editor.value;
        lastLoadedMarkdownContent = editor.value;
        showSavePulse();
        const refreshedNote = await NoteService.GetNote(currentNote.path);
        if (refreshedNote) {
            currentNote = refreshedNote;
        }
    } catch (err) {
        console.error("Failed to save note:", err);
    }
}

async function syncOpenFileWithVault() {
    if (!currentFilePath) {
        return;
    }

    const fileType = getFileTypeFromPath(currentFilePath);

    if (fileType === "markdown") {
        if (!currentNote) {
            return;
        }
        // Skip external refresh while the user has unsaved local edits.
        if (editor.value !== lastLoadedMarkdownContent) {
            return;
        }

        try {
            const note = await NoteService.GetNote(currentFilePath);
            if (!note) {
                return;
            }

            if (note.content === lastLoadedMarkdownContent) {
                await Promise.allSettled([
                    loadBacklinks(note.path),
                    loadOutgoingLinks(note.path),
                ]);
                return;
            }

            currentNote = note;
            lastLoadedMarkdownContent = note.content;
            editor.value = note.content;
            editor.selectionStart = 0;
            editor.selectionEnd = 0;
            editor.scrollTop = 0;
            updatePreview();
            await Promise.allSettled([
                loadBacklinks(note.path),
                loadOutgoingLinks(note.path),
            ]);
            updatePaneTitles(getDisplayName(note.path, "file"));
            updateFileTreeSelection(note.path, { reveal: false });
        } catch (err) {
            console.warn("Failed to refresh markdown note from vault:", err);
            clearCurrentSelection();
            await StateService.ClearLastOpenedFile();
        }
        return;
    }

    if (fileType === "html") {
        if (htmlEditor.value !== lastLoadedHtmlContent) {
            return;
        }
        try {
            const nextContent = await FileService.ReadFile(currentFilePath);
            if (htmlEditor.value !== nextContent) {
                lastLoadedHtmlContent = nextContent;
                htmlEditor.value = nextContent;
                updateHtmlPreview();
            }
        } catch (err) {
            console.warn("Failed to refresh HTML file from vault:", err);
            clearCurrentSelection();
        }
        return;
    }

    if (fileType === "text") {
        if (!currentTextPath || editor.value !== lastLoadedTextContent) {
            return;
        }
        try {
            const nextContent = await FileService.ReadFile(currentFilePath);
            if (editor.value !== nextContent) {
                lastLoadedTextContent = nextContent;
                editor.value = nextContent;
                updatePreview();
            }
        } catch (err) {
            console.warn("Failed to refresh text file from vault:", err);
            clearCurrentSelection();
        }
        return;
    }

    // Binary viewers keep their current rendered state. Reopening them on every
    // vault watch tick makes PDFs/images visibly flicker.
}

async function openTodayNote() {
    showTimeline = false;
    hideAllViewers();
    editorContainer.style.display = "flex";

    try {
        const note = await NoteService.GetTodayDailyNote();
        if (note) {
            currentFilePath = note.path;
            currentTextPath = null;
            currentHtmlPath = null;
            lastLoadedTextContent = "";
            currentNote = note;
            editor.value = note.content;
            lastLoadedMarkdownContent = note.content;
            // Reset cursor position and scroll to the top
            editor.selectionStart = 0;
            editor.selectionEnd = 0;
            editor.scrollTop = 0;
            updatePreview();
            await loadBacklinks(note.path);
            await loadOutgoingLinks(note.path);

            // Update pane titles
            const filename = note.path.split("/").pop()?.replace(/\.md$/i, "") || note.path;
            updatePaneTitles(filename);

            // Update file tree selection
            updateFileTreeSelection(note.path);

            try {
                await StateService.SetLastOpenedFile(note.path, "markdown");
            } catch (err) {
                console.warn("Failed to persist last opened file:", err);
            }
        }
    } catch (err) {
        console.error("Failed to open today's note:", err);
    }
}

// Preview
function updatePreview() {
    const content = editor.value;
    if (currentTextPath) {
        preview.innerHTML = `<pre class="plain-text-preview">${escapeHtml(content)}</pre>`;
        outlineList.innerHTML = '<div class="outline-empty">Headings you write will gather here</div>';
        refreshNoteSearchHighlights();
        return;
    }

    preview.innerHTML = parseMarkdown(content);
    // Syntax highlighting for code blocks
    preview.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
    });
    enhanceCodeBlocks();
    // Initialize mermaid diagrams after rendering
    setTimeout(() => initMermaidDiagrams(), 100);
    // Update outline
    updateOutline(content);
    // Resolve vault images to base64 data URLs
    resolvePreviewImages();
    refreshNoteSearchHighlights();
}

async function resolvePreviewImages() {
    const notePath = currentFilePath || "";
    const images = preview.querySelectorAll<HTMLImageElement>("img");
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

function setupPreviewInteractions() {
    preview.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;

        const image = target.closest("img") as HTMLImageElement | null;
        if (image && preview.contains(image)) {
            e.preventDefault();
            e.stopPropagation();
            openPreviewImageLightbox(image);
            return;
        }

        const wikiLink = target.closest(".wiki-link") as HTMLElement | null;
        if (wikiLink && preview.contains(wikiLink)) {
            e.preventDefault();
            e.stopPropagation();
            void openWikiLink(wikiLink);
        }
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

async function openWikiLink(linkEl: HTMLElement) {
    const linkTarget = linkEl.getAttribute("data-link") || "";
    if (!linkTarget) return;

    try {
        const [resolvedPath, found] = await LinkService.ResolveLink(linkTarget) as [string, boolean];
        linkEl.classList.toggle("broken", !found);
        if (found && resolvedPath) {
            await openNote(resolvedPath);
        }
    } catch (err) {
        console.error("Failed to open wiki link:", err);
        linkEl.classList.add("broken");
    }
}

function enhanceCodeBlocks() {
    preview.querySelectorAll<HTMLPreElement>("pre").forEach((pre) => {
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
    const headings = extractHeadings(content);
    outlineList.innerHTML = renderOutlineHTML(headings);
    activeOutlineIndex = -1;
    syncPreviewHeadingAnchors(headings.length);

    // Click to jump to heading
    outlineList.querySelectorAll(".outline-item").forEach(item => {
        item.addEventListener("click", () => {
            const line = parseInt(item.getAttribute("data-line") || "0");
            const index = parseInt(item.getAttribute("data-heading-index") || "-1", 10);
            jumpToLine(line);
            scrollPreviewHeadingIntoView(index);
            setActiveOutlineIndex(index, true);
        });
    });
    updateActiveOutlineFromPreview();
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
    noteSearch.hidden = false;
    noteSearchInput.value = noteSearchQuery;
    refreshNoteSearchHighlights();
    window.requestAnimationFrame(() => {
        noteSearchInput.focus();
        noteSearchInput.select();
    });
}

function closeNoteSearch() {
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
    const lines = editor.value.split("\n");
    let pos = 0;
    for (let i = 0; i < lineNumber && i < lines.length; i++) {
        pos += lines[i].length + 1;
    }
    editor.focus();
    editor.setSelectionRange(pos, pos);
    // Calculate actual line height from computed styles
    const computedStyle = getComputedStyle(editor);
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
    editor.scrollTop = lineNumber * lineHeight - editor.clientHeight / 3;
}


// Timeline
function toggleTimeline() {
    showTimeline = !showTimeline;
    hideAllViewers();
    if (showTimeline) {
        timelinePanel.style.display = "block";
        loadTimelines();
    } else {
        editorContainer.style.display = "flex";
    }
}

async function loadTimelines() {
    try {
        // Get timelines from the last 7 days
        const timelines = await NoteService.GetRecentTimelines(7);
        renderTimelines(timelines);
    } catch (err) {
        console.error("Failed to load timelines:", err);
        timelineTimeline.innerHTML = '<div class="error">No memos yet</div>';
    }
}

function renderTimelines(timelines: Timeline[]) {
    timelineTimeline.innerHTML = "";

    let currentDate = "";

    for (const timeline of timelines) {
        // Add date separator if date changed
        if (timeline.date && timeline.date !== currentDate) {
            currentDate = timeline.date;
            const dateSeparator = document.createElement("div");
            dateSeparator.className = "timeline-date-separator";
            dateSeparator.textContent = currentDate;
            timelineTimeline.appendChild(dateSeparator);
        }

        const el = document.createElement("div");
        el.className = "timeline-item";
        el.innerHTML = `
            <div class="timeline-time">${timeline.time}</div>
            <div class="timeline-content">${timeline.content}</div>
        `;
        timelineTimeline.appendChild(el);
    }

    if (timelines.length === 0) {
        timelineTimeline.innerHTML = '<div class="empty">No memos yet. Start writing!</div>';
    }
}

async function submitTimeline() {
    const content = timelineInput.value.trim();
    if (!content) return;

    try {
        await NoteService.AddTimeline(content);
        timelineInput.value = "";
        await loadTimelines();
    } catch (err) {
        console.error("Failed to add timeline:", err);
    }
}

// Backlinks
async function loadBacklinks(path: string) {
    try {
        const backlinks = await LinkService.GetBacklinks(path);
        renderBacklinks(backlinks);
    } catch (err) {
        console.error("Failed to load backlinks:", err);
        backlinksList.innerHTML = "";
    }
}

function clearBacklinks() {
    backlinksList.innerHTML = '<div class="empty">No notes link here yet</div>';
}

function renderBacklinks(backlinks: Backlink[]) {
    backlinksList.innerHTML = "";

    for (const bl of backlinks) {
        const el = document.createElement("div");
        el.className = "backlink-item";
        el.innerHTML = `
            <div class="backlink-title">${bl.sourceTitle}</div>
            <div class="backlink-context">${bl.context}</div>
        `;
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            openNote(bl.sourcePath);
        });
        backlinksList.appendChild(el);
    }

    if (backlinks.length === 0) {
        backlinksList.innerHTML = '<div class="empty">No notes link here yet</div>';
    }
}

// Outgoing Links
async function loadOutgoingLinks(path: string) {
    try {
        const links = await LinkService.GetLinkInfo(path);
        renderOutgoingLinks(links);
    } catch (err) {
        console.error("Failed to load outgoing links:", err);
        outgoingLinksList.innerHTML = "";
    }
}

function clearOutgoingLinks() {
    outgoingLinksList.innerHTML = '<div class="empty">No links from this note yet</div>';
}

function renderOutgoingLinks(links: Link[]) {
    outgoingLinksList.innerHTML = "";

    // Filter: only show existing markdown files
    const filteredLinks = links.filter(link => {
        if (!link.exists) return false;
        // Check if it's a markdown file (ends with .md or has no extension)
        const hasExtension = link.targetPath.includes('.');
        if (hasExtension && !link.targetPath.endsWith('.md')) return false;
        return true;
    });

    for (const link of filteredLinks) {
        const el = document.createElement("div");
        el.className = "outgoing-link-item exists";
        el.innerHTML = `<span class="link-text">${link.text}</span>`;
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            openNote(link.targetPath);
        });
        outgoingLinksList.appendChild(el);
    }

    if (filteredLinks.length === 0) {
        outgoingLinksList.innerHTML = '<div class="empty">No links from this note yet</div>';
    }
}

// Resize Panels
function setupResizeHandles() {
    const sidebar = document.getElementById("sidebar")!;
    const sidebarResize = document.getElementById("sidebar-resize")!;
    const editorPane = document.getElementById("editor-pane")!;
    const editorResize = document.getElementById("editor-resize")!;

    // Sidebar resize
    let isResizingSidebar = false;
    sidebarResize.addEventListener("mousedown", (e) => {
        isResizingSidebar = true;
        sidebarResize.classList.add("dragging");
        e.preventDefault();
    });

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
            if (newWidth >= 150 && newWidth <= 500) {
                sidebar.style.width = `${newWidth}px`;
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
        isResizingSidebar = false;
        isResizingEditor = false;
        sidebarResize.classList.remove("dragging");
        editorResize.classList.remove("dragging");
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

    // Restore selection without changing user-controlled folder expansion.
    if (currentFilePath) {
        updateFileTreeSelection(currentFilePath, { reveal: false });
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

    // Hide all viewers
    hideAllViewers();

    const graphOverlay = document.getElementById("graph-overlay")!;
    graphOverlay.classList.add("visible");

    // Load and render graph
    await loadGraphData();
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
}

function saveGraphNodePositions() {
    if (!graphInstance) return;

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

    try {
        // Always check cache first
        const cached = loadCache(graphCacheStorage);

        if (cached && isCacheValid(cached) && !forceRefresh) {
            // Show cached data immediately
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

            // Background update (don't await, just start it)
            updateGraphDataInBackground().catch(console.error);
            return;
        }

        // No cache or force refresh - load fresh data
        graphStats.textContent = "Building index...";
        await LinkService.RebuildIndex();

        const graph = await GraphService.GetFullGraph();
        const stats = await GraphService.GetGraphStats();

        // Save to cache
        const cacheData: CachedGraphData = {
            graph,
            stats,
            graphSignature: createGraphStructureSignature(graph),
        };
        saveCache(graphCacheStorage, createCacheEntry(cacheData));

        // Update stats display
        graphStats.textContent = `${stats.nodeCount || 0} notes, ${stats.edgeCount || 0} links`;

        // Render the graph
        renderGraph(graph, graphContainer);
    } catch (err) {
        console.error("Failed to load graph:", err);
        graphStats.textContent = "Failed to load graph";
        graphContainer.innerHTML = '<div class="graph-error">Failed to load graph data</div>';
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
    // Clear position cache to get fresh layout
    const cached = loadCache(graphCacheStorage);
    if (cached) {
        const cachedData = cached.data as CachedGraphData;
        cachedData.nodePositions = undefined;
        cachedData.viewState = undefined;
        cachedData.graphSignature = createGraphStructureSignature(cachedData.graph);
        saveCache(graphCacheStorage, createCacheEntry(cachedData, cached.timestamp));
    }
    await loadGraphData(true);
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

async function initMermaidDiagrams() {
    const previewEl = document.getElementById("preview");
    if (!previewEl) return;
    const renderVersion = ++mermaidRenderVersion;

    await document.fonts.ready;
    if (renderVersion !== mermaidRenderVersion) return;

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
            if (renderVersion !== mermaidRenderVersion || !pre.isConnected || code.textContent?.trim() !== text) {
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

        if (renderVersion === mermaidRenderVersion && pre.isConnected) {
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
