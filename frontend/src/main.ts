import * as ConfigService from "../bindings/github.com/kazuph/obails/services/configservice.js";
import * as FileService from "../bindings/github.com/kazuph/obails/services/fileservice.js";
import * as NoteService from "../bindings/github.com/kazuph/obails/services/noteservice.js";
import * as LinkService from "../bindings/github.com/kazuph/obails/services/linkservice.js";
import * as WindowService from "../bindings/github.com/kazuph/obails/services/windowservice.js";
import * as GraphService from "../bindings/github.com/kazuph/obails/services/graphservice.js";
import { FileInfo, Note, Timeline, Backlink, Link, Config, Graph } from "../bindings/github.com/kazuph/obails/models/models.js";
import mermaid from "mermaid";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import ForceGraph from "force-graph";
import { debounce } from "./lib/utils";
import { LIGHT_THEMES, isDarkTheme } from "./lib/theme";
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
} from "./lib/graph-cache";
import * as pdfjsLib from "pdfjs-dist";

// Setup PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

// State
let currentNote: Note | null = null;
let currentFilePath: string | null = null;  // Tracks any open file (md, image, pdf, html)
let showTimeline = false;
let showGraph = false;
let contextMenuTargetPath: string = "";
let contextMenuTargetIsDir: boolean = false;
let draggedFilePath: string | null = null;
let graphInstance: ReturnType<typeof ForceGraph> | null = null;

// DOM Elements
const fileTree = document.getElementById("file-tree")!;
const editor = document.getElementById("editor") as HTMLTextAreaElement;
const preview = document.getElementById("preview")!;
const timelinePanel = document.getElementById("timeline-panel")!;
const editorContainer = document.querySelector(".editor-container") as HTMLElement;
const timelineInput = document.getElementById("timeline-input") as HTMLTextAreaElement;
const timelineTimeline = document.getElementById("timeline-timeline")!;
const backlinksList = document.getElementById("backlinks-list")!;
const outgoingLinksList = document.getElementById("outgoing-links-list")!;
const outlineList = document.getElementById("outline-list")!;
const fileSearchInput = document.getElementById("file-search-input") as HTMLInputElement;
const fileSearchClear = document.getElementById("file-search-clear")!;

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
        if (config?.Vault?.Path) {
            await loadFileTree();

            // Open last file if exists
            const lastFileData = localStorage.getItem("obails-last-file");
            if (lastFileData) {
                try {
                    // Support both new JSON format and legacy string format
                    let path: string;
                    let fileType: string;
                    try {
                        const parsed = JSON.parse(lastFileData);
                        path = parsed.path;
                        fileType = parsed.fileType;
                    } catch {
                        // Legacy format: just the path (assume markdown)
                        path = lastFileData;
                        fileType = "markdown";
                    }
                    await openFile(path, fileType);
                } catch {
                    // File might have been deleted, clear the storage
                    localStorage.removeItem("obails-last-file");
                }
            }

            // Prefetch graph data in background (don't block init)
            prefetchGraphData().catch(console.error);
        }
    } catch (err) {
        console.warn("Running in browser mode - backend services unavailable");
    }

    setupEventListeners();
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

        const cacheData: CachedGraphData = {
            graph,
            stats,
            nodePositions: cachedData?.nodePositions,
            viewState: cachedData?.viewState,
        };
        saveCache(graphCacheStorage, createCacheEntry(cacheData));
        console.log("[Graph] Prefetch complete - ready for instant display");
    } catch (err) {
        console.error("[Graph] Prefetch failed:", err);
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
    document.getElementById("timeline-submit")!.addEventListener("click", submitTimeline);

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

    editor.addEventListener("input", debounce(saveCurrentNote, 500));
    editor.addEventListener("input", updatePreview);

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

    // Handle external links in preview - open in external browser
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
        if ((e.metaKey || e.ctrlKey) && e.key === ",") {
            e.preventDefault();
            openSettings();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === "n") {
            e.preventDefault();
            showNewNoteForm();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === "g") {
            e.preventDefault();
            toggleGraphView();
        }
        // ESC to close overlays
        if (e.key === "Escape") {
            if (pdfIsFullscreen) {
                closePdfFullscreen();
            } else if (imageFullscreenOverlay.style.display !== "none") {
                closeImageFullscreen();
            } else if (showGraph) {
                hideGraphView();
            }
            hideContextMenu();
        }
        // Cmd+F or Ctrl+F to focus file search
        if ((e.metaKey || e.ctrlKey) && e.key === "f" && !editor.matches(":focus")) {
            e.preventDefault();
            fileSearchInput.focus();
            fileSearchInput.select();
        }
    });

    setupResizeHandles();
    setupThemeSelector();
    setupContextMenu();
    setupFileTreeDropTarget();
    setupFileSearch();
}

// Setup file-tree as drop target for moving files to root
function setupFileTreeDropTarget() {
    // Allow drop on file-tree itself (root directory)
    fileTree.addEventListener("dragover", (e) => {
        // Only highlight if dropping on file-tree directly, not on child elements
        if (e.target === fileTree && draggedFilePath) {
            e.preventDefault();
            fileTree.classList.add("drag-over-root");
        }
    });

    fileTree.addEventListener("dragleave", (e) => {
        if (e.target === fileTree) {
            fileTree.classList.remove("drag-over-root");
        }
    });

    fileTree.addEventListener("drop", async (e) => {
        // Only handle drop on file-tree directly (root), not on folders
        if (e.target === fileTree && draggedFilePath) {
            e.preventDefault();
            fileTree.classList.remove("drag-over-root");
            // Move to root (empty string as target)
            await moveFileToFolder(draggedFilePath, "");
        }
    });
}

// File Search
function setupFileSearch() {
    if (!fileSearchInput) {
        console.error("[FileSearch] fileSearchInput element not found!");
        return;
    }
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;

    // Incremental search on input
    fileSearchInput.addEventListener("input", () => {
        const query = fileSearchInput.value.trim().toLowerCase();

        // Show/hide clear button
        fileSearchClear.style.display = query ? "block" : "none";

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
        fileSearchInput.focus();
    });

    // Escape to clear and blur
    fileSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (fileSearchInput.value) {
                fileSearchInput.value = "";
                fileSearchClear.style.display = "none";
                filterFileTree("");
            } else {
                fileSearchInput.blur();
            }
        }
    });
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
    const form = document.getElementById("new-note-form")!;
    const input = document.getElementById("new-note-input") as HTMLInputElement;
    form.style.display = "block";
    input.value = "";
    input.focus();
}

function hideNewNoteForm() {
    const form = document.getElementById("new-note-form")!;
    form.style.display = "none";
}

async function createNewNote() {
    const input = document.getElementById("new-note-input") as HTMLInputElement;
    const filename = input.value.trim();

    if (!filename) {
        input.focus();
        return;
    }

    // Sanitize filename (remove invalid characters)
    const sanitized = filename.replace(/[<>:"/\\|?*]/g, "").trim();
    if (!sanitized) {
        input.focus();
        return;
    }

    // Get target folder from input data attribute (if coming from folder context menu)
    const targetFolder = input.dataset.targetFolder || "";
    const relativePath = targetFolder ? `${targetFolder}/${sanitized}.md` : `${sanitized}.md`;
    const initialContent = `# ${sanitized}\n\n`;

    try {
        await FileService.CreateFile(relativePath, initialContent);
        hideNewNoteForm();
        // Reset input state
        delete input.dataset.targetFolder;
        input.placeholder = "Enter filename (without .md)";
        await loadFileTree();
        await openNote(relativePath);
    } catch (err) {
        console.error("Failed to create note:", err);
        alert(`Failed to create note: ${err}`);
    }
}

// Context Menu
function setupContextMenu() {
    const contextMenu = document.getElementById("context-menu")!;
    const ctxNewFile = document.getElementById("ctx-new-file")!;
    const ctxDelete = document.getElementById("ctx-delete")!;

    // Hide context menu on any interaction elsewhere
    // Use capture phase (true) to catch events before stopPropagation() is called
    document.addEventListener("mousedown", (e) => {
        // Don't hide if clicking inside context menu
        if (!contextMenu.contains(e.target as Node)) {
            hideContextMenu();
        }
    }, true); // capture phase

    // Also hide on right-click elsewhere (contextmenu event)
    document.addEventListener("contextmenu", (e) => {
        // If right-clicking outside the context menu, hide it first
        // (the new context menu will be shown by the file item's handler after)
        if (!contextMenu.contains(e.target as Node)) {
            hideContextMenu();
        }
    }, true); // capture phase

    // Handle "New File" click
    ctxNewFile.addEventListener("click", () => {
        // Save path before hiding (hideContextMenu clears these)
        const targetPath = contextMenuTargetPath;
        const isDir = contextMenuTargetIsDir;
        hideContextMenu();
        if (isDir) {
            showNewNoteFormInFolder(targetPath);
        } else {
            showNewNoteForm();
        }
    });

    // Handle "Delete" click
    ctxDelete.addEventListener("click", async () => {
        // Save path before hiding (hideContextMenu clears these)
        const targetPath = contextMenuTargetPath;
        const isDir = contextMenuTargetIsDir;
        hideContextMenu();
        await deleteTargetPathWithArgs(targetPath, isDir);
    });
}

function showContextMenu(x: number, y: number, path: string, isDir: boolean) {
    const contextMenu = document.getElementById("context-menu")!;
    const ctxNewFile = document.getElementById("ctx-new-file")!;

    contextMenuTargetPath = path;
    contextMenuTargetIsDir = isDir;

    // Show/hide "New File" based on whether it's a directory
    ctxNewFile.style.display = isDir ? "flex" : "none";

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
    contextMenu.style.display = "none";
    contextMenuTargetPath = "";
    contextMenuTargetIsDir = false;
}

async function moveFileToFolder(sourcePath: string, targetFolder: string) {
    const fileName = sourcePath.split("/").pop();
    const newPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;

    if (sourcePath === newPath) return;

    try {
        await FileService.MoveFile(sourcePath, newPath!);
        await loadFileTree();

        // Update current note path if the moved file was open
        if (currentNote && currentNote.path === sourcePath) {
            currentNote.path = newPath!;
            localStorage.setItem("obails-last-file", JSON.stringify({ path: newPath!, fileType: "markdown" }));
        }
    } catch (err) {
        console.error("Failed to move file:", err);
        alert(`Failed to move file: ${err}`);
    }
}

async function deleteTargetPathWithArgs(targetPath: string, isDir: boolean) {
    if (!targetPath) return;

    const itemType = isDir ? "folder" : "file";
    const confirmed = confirm(`Are you sure you want to delete this ${itemType}?\n\n${targetPath}`);

    if (!confirmed) return;

    try {
        await FileService.DeletePath(targetPath);
        await loadFileTree();

        // If deleted file was currently open, clear editor
        if (currentNote && currentNote.path === targetPath) {
            currentNote = null;
            editor.value = "";
            updatePreview();
            clearBacklinks();
            clearOutgoingLinks();
            localStorage.removeItem("obails-last-file");
        }
    } catch (err) {
        console.error("Failed to delete:", err);
        alert(`Failed to delete: ${err}`);
    }
}

function showNewNoteFormInFolder(folderPath: string) {
    const form = document.getElementById("new-note-form")!;
    const input = document.getElementById("new-note-input") as HTMLInputElement;

    // Store target folder path for creation
    input.dataset.targetFolder = folderPath;
    form.style.display = "block";
    input.value = "";
    input.placeholder = `New file in ${folderPath || "root"}`;
    input.focus();
}

// Theme
function setupThemeSelector() {
    const themeSelect = document.getElementById("theme-select") as HTMLSelectElement;

    // Load saved theme
    const savedTheme = localStorage.getItem("obails-theme") || "github-light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    themeSelect.value = savedTheme;

    // Handle theme change
    themeSelect.addEventListener("change", () => {
        const theme = themeSelect.value;
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("obails-theme", theme);

        // Re-initialize mermaid with new theme
        const isDark = !LIGHT_THEMES.includes(theme);
        mermaid.initialize({
            startOnLoad: false,
            theme: isDark ? "dark" : "default",
            securityLevel: "loose",
            logLevel: "error"
        });

        // Re-render mermaid diagrams
        updatePreview();
    });
}

// File Type Helpers
function getFileIcon(file: FileInfo): string {
    if (file.isDir) return "📁";

    const fileType = file.fileType || "other";
    switch (fileType) {
        case "markdown": return "📝";
        case "image": return "🖼️";
        case "pdf": return "📕";
        case "html": return "🌐";
        default: return "📄";
    }
}

// Open file based on file type
async function openFile(path: string, fileType: string): Promise<void> {
    hideAllViewers();
    currentFilePath = path;  // Track current file for refresh

    // Save last opened file to localStorage (for all supported types)
    if (fileType === "markdown" || fileType === "image" || fileType === "pdf" || fileType === "html") {
        localStorage.setItem("obails-last-file", JSON.stringify({ path, fileType }));
    }

    switch (fileType) {
        case "markdown":
            await openNote(path);
            break;
        case "image":
            await openImage(path);
            break;
        case "pdf":
            await openPDF(path);
            break;
        case "html":
            await openHTML(path);
            break;
        default:
            // Open with system default app (macOS open command)
            await openExternal(path);
            break;
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
    const icon = pdfViewMode === 'continuous' ? '📄' : '📃';
    viewModeBtn.textContent = icon;
    viewModeFsBtn.textContent = icon;
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

// Update HTML preview
function updateHtmlPreview() {
    const content = htmlEditor.value;
    const doc = htmlPreview.contentDocument || htmlPreview.contentWindow?.document;
    if (doc) {
        doc.open();
        doc.write(content);
        doc.close();
    }
}

// Save HTML file
async function saveHtmlFile() {
    if (!currentHtmlPath) return;

    try {
        await FileService.CreateFile(currentHtmlPath, htmlEditor.value);
    } catch (err) {
        console.error("Failed to save HTML:", err);
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
    };
    return mimeTypes[ext] || "application/octet-stream";
}

// Update file tree selection highlight
function updateFileTreeSelection(path: string) {
    // Remove previous selection
    document.querySelectorAll(".file-item").forEach(el => el.classList.remove("active"));

    // Expand parent folders to reveal the file
    expandParentFolders(path);

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
            folderItem.classList.add("expanded");

            // Update folder icon
            const iconSpan = folderItem.querySelector(".folder-icon");
            if (iconSpan) {
                iconSpan.textContent = "📂";
            }

            // Show children
            const wrapper = folderItem.parentElement;
            if (wrapper) {
                const childrenEl = wrapper.querySelector(".folder-children") as HTMLElement;
                if (childrenEl) {
                    childrenEl.style.display = "block";
                }
            }
        }
    }
}

// File Tree
async function loadFileTree() {
    try {
        const files = await FileService.ListDirectoryTree();
        renderFileTree(files);
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

    const icon = getFileIcon(file);
    el.innerHTML = `<span class="folder-icon">${icon}</span><span class="file-name">${file.name}</span>`;

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
            e.stopPropagation();
            el.classList.toggle("expanded");
            const iconSpan = el.querySelector(".folder-icon");
            if (iconSpan) {
                // 📂 = open folder, 📁 = closed folder
                iconSpan.textContent = el.classList.contains("expanded") ? "📂" : "📁";
            }
            if (childrenEl) {
                childrenEl.style.display = childrenEl.style.display === "none" ? "block" : "none";
            }
        });

        // Right-click context menu for folders
        el.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, file.path, true);
        });

        // Drop target for drag & drop
        el.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (draggedFilePath) {
                el.classList.add("drag-over");
            }
        });
        el.addEventListener("dragleave", () => {
            el.classList.remove("drag-over");
        });
        el.addEventListener("drop", async (e) => {
            e.preventDefault();
            el.classList.remove("drag-over");
            if (draggedFilePath && draggedFilePath !== file.path) {
                await moveFileToFolder(draggedFilePath, file.path);
            }
        });
    } else {
        // Handle file click based on file type
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            openFile(file.path, file.fileType || "other");
        });

        // Right-click context menu for files
        el.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, file.path, false);
        });
    }

    return wrapper;
}

// Note Operations
async function openNote(path: string) {
    try {
        currentNote = await NoteService.GetNote(path);
        if (currentNote) {
            editor.value = currentNote.content;
            updatePreview();
            await loadBacklinks(path);
            await loadOutgoingLinks(path);

            // Save to localStorage (also saves when called directly from backlinks/outgoing links/graph)
            localStorage.setItem("obails-last-file", JSON.stringify({ path, fileType: "markdown" }));

            // Update pane titles (remove .md extension)
            const filename = path.split("/").pop()?.replace(/\.md$/i, "") || path;
            updatePaneTitles(filename);
        }

        // Hide all viewers, show markdown editor
        showTimeline = false;
        hideAllViewers();
        editorContainer.style.display = "flex";

        // Update file tree selection
        updateFileTreeSelection(path);
    } catch (err) {
        console.error("Failed to open note:", err);
    }
}

// Update editor and preview pane titles
function updatePaneTitles(title: string) {
    const editorTitle = document.getElementById("editor-title");
    const previewTitle = document.getElementById("preview-title");
    if (editorTitle) editorTitle.textContent = title;
    if (previewTitle) previewTitle.textContent = title;
}

async function saveCurrentNote() {
    if (!currentNote) return;

    try {
        await NoteService.SaveNote(currentNote.path, editor.value);
        currentNote.content = editor.value;
    } catch (err) {
        console.error("Failed to save note:", err);
    }
}

async function openTodayNote() {
    try {
        const note = await NoteService.GetTodayDailyNote();
        if (note) {
            currentNote = note;
            editor.value = note.content;
            updatePreview();
            await loadBacklinks(note.path);
            await loadOutgoingLinks(note.path);

            // Update pane titles
            const filename = note.path.split("/").pop()?.replace(/\.md$/i, "") || note.path;
            updatePaneTitles(filename);

            // Update file tree selection
            updateFileTreeSelection(note.path);
        }

        showTimeline = false;
        hideAllViewers();
        editorContainer.style.display = "flex";
    } catch (err) {
        console.error("Failed to open today's note:", err);
    }
}

// Preview
function updatePreview() {
    const content = editor.value;
    preview.innerHTML = parseMarkdown(content);
    // Syntax highlighting for code blocks
    preview.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
    });
    // Initialize mermaid diagrams after rendering
    setTimeout(() => initMermaidDiagrams(), 100);
    // Update outline
    updateOutline(content);
}

// Outline
function updateOutline(content: string) {
    const headings = extractHeadings(content);
    outlineList.innerHTML = renderOutlineHTML(headings);

    // Click to jump to heading
    outlineList.querySelectorAll(".outline-item").forEach(item => {
        item.addEventListener("click", () => {
            const line = parseInt(item.getAttribute("data-line") || "0");
            jumpToLine(line);
        });
    });
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
        const timelines = await NoteService.GetTodayTimelines();
        renderTimelines(timelines);
    } catch (err) {
        console.error("Failed to load timelines:", err);
        timelineTimeline.innerHTML = '<div class="error">No timelines for today</div>';
    }
}

function renderTimelines(timelines: Timeline[]) {
    timelineTimeline.innerHTML = "";

    for (const timeline of [...timelines].reverse()) {
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
    backlinksList.innerHTML = '<div class="empty">No backlinks</div>';
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
        backlinksList.innerHTML = '<div class="empty">No backlinks</div>';
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
    outgoingLinksList.innerHTML = '<div class="empty">No outgoing links</div>';
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
        outgoingLinksList.innerHTML = '<div class="empty">No outgoing links</div>';
    }
}

// Resize Panels
function setupResizeHandles() {
    const sidebar = document.getElementById("sidebar")!;
    const sidebarResize = document.getElementById("sidebar-resize")!;
    const editorPane = document.getElementById("editor-pane")!;
    const editorResize = document.getElementById("editor-resize")!;
    const outlinePanel = document.getElementById("outline-panel")!;
    const backlinksPanel = document.getElementById("backlinks-panel")!;
    // Use outline-resize for right sidebar panel resizing
    const outlineResize = document.getElementById("outline-resize");

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

    // Right sidebar (outline/backlinks) resize
    let isResizingRightSidebar = false;
    if (outlineResize) {
        outlineResize.addEventListener("mousedown", (e) => {
            isResizingRightSidebar = true;
            outlineResize.classList.add("dragging");
            e.preventDefault();
        });
    }

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
        if (isResizingRightSidebar) {
            const rightSidebar = document.getElementById("right-sidebar")!;
            const rightSidebarRect = rightSidebar.getBoundingClientRect();
            const newOutlineHeight = e.clientY - rightSidebarRect.top;
            const totalHeight = rightSidebarRect.height;
            if (newOutlineHeight >= 80 && newOutlineHeight <= totalHeight - 80) {
                outlinePanel.style.flex = "none";
                outlinePanel.style.height = `${newOutlineHeight}px`;
                backlinksPanel.style.flex = "1";
            }
        }
    });

    document.addEventListener("mouseup", () => {
        isResizingSidebar = false;
        isResizingEditor = false;
        isResizingRightSidebar = false;
        sidebarResize.classList.remove("dragging");
        editorResize.classList.remove("dragging");
        if (outlineResize) {
            outlineResize.classList.remove("dragging");
        }
    });
}

// Utilities
async function refresh() {
    await loadFileTree();
    await LinkService.RebuildIndex();

    // Restore file tree selection and expand parent folders
    if (currentFilePath) {
        expandParentFolders(currentFilePath);
        updateFileTreeSelection(currentFilePath);
    }

    // If graph view is showing, refresh the graph data
    if (showGraph) {
        await refreshGraphData();
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

function hideGraphView() {
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
        const lastFileData = localStorage.getItem("obails-last-file");
        if (lastFileData) {
            try {
                // Support both new JSON format and legacy string format
                let path: string;
                let fileType: string;
                try {
                    const parsed = JSON.parse(lastFileData);
                    path = parsed.path;
                    fileType = parsed.fileType;
                } catch {
                    // Legacy format: just the path (assume markdown)
                    path = lastFileData;
                    fileType = "markdown";
                }
                openFile(path, fileType).catch(() => {
                    localStorage.removeItem("obails-last-file");
                });
            } catch {
                localStorage.removeItem("obails-last-file");
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
            const age = getCacheAgeText(cached);
            graphStats.textContent = `${cachedData.stats.nodeCount || 0} notes, ${cachedData.stats.edgeCount || 0} links (${age})`;
            renderGraph(cachedData.graph, graphContainer, cachedData.nodePositions, cachedData.viewState);

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
        const cacheData: CachedGraphData = { graph, stats };
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

        // Save new data to cache, preserving positions and view state
        const cacheData: CachedGraphData = {
            graph,
            stats,
            nodePositions: cachedData?.nodePositions,
            viewState: cachedData?.viewState,
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
}

interface GraphEdgeData {
    source: string | GraphNodeData;
    target: string | GraphNodeData;
}

function renderGraph(
    graph: Graph,
    container: HTMLElement,
    savedPositions?: { [id: string]: { x: number; y: number } },
    savedViewState?: { zoom: number; centerX: number; centerY: number }
) {
    // Clean up existing instance
    if (graphInstance) {
        graphInstance._destructor();
    }

    container.innerHTML = "";

    // Prepare data for force-graph with restored positions
    // Note: Backend already filters to markdown-only nodes and edges
    const nodes: GraphNodeData[] = graph.nodes.map(n => {
        const pos = savedPositions?.[n.id];
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

    // Space/cosmic color scheme
    const savedTheme = localStorage.getItem("obails-theme") || "github-light";
    const isDark = !LIGHT_THEMES.includes(savedTheme);

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
        .nodeVal((node: GraphNodeData) => Math.max(1, Math.log(node.linkCount + 1) * 2))
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
        .cooldownTicks(savedPositions ? 0 : 100) // Skip simulation if positions restored
        .d3AlphaDecay(0.02)
        .d3VelocityDecay(0.3)
        .warmupTicks(savedPositions ? 0 : 50); // Skip warmup if positions restored

    // Restore view state or zoom to fit
    setTimeout(() => {
        if (savedViewState && savedPositions) {
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
            // Zoom to fit for new graphs
            graphInstance?.zoomToFit(400, 50);
        }
    }, 100);

    // Custom wheel handler:
    // - Normal 2-finger scroll = pan (move around)
    // - Ctrl/Cmd/Shift + 2-finger scroll = zoom (standard for design tools)
    container.addEventListener("wheel", (e: WheelEvent) => {
        if (!graphInstance) return;
        e.preventDefault();

        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            // Ctrl/Cmd/Shift + scroll = zoom (supports all platforms)
            const currentZoom = graphInstance.zoom();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            graphInstance.zoom(currentZoom * zoomFactor);
        } else {
            // Normal scroll = pan
            const { x, y } = graphInstance.centerAt() as { x: number; y: number };
            const zoomLevel = graphInstance.zoom();
            // Adjust pan speed based on zoom level
            const panSpeed = 1 / zoomLevel;
            graphInstance.centerAt(x + e.deltaX * panSpeed, y + e.deltaY * panSpeed);
        }
    }, { passive: false });

    // Pinch zoom handler (macOS/Safari gesture events)
    let initialPinchZoom = 1;
    container.addEventListener("gesturestart", ((e: GestureEvent) => {
        if (!graphInstance) return;
        e.preventDefault();
        initialPinchZoom = graphInstance.zoom();
    }) as EventListener, { passive: false });

    container.addEventListener("gesturechange", ((e: GestureEvent) => {
        if (!graphInstance) return;
        e.preventDefault();
        graphInstance.zoom(initialPinchZoom * e.scale);
    }) as EventListener, { passive: false });

    container.addEventListener("gestureend", ((e: GestureEvent) => {
        e.preventDefault();
    }) as EventListener, { passive: false });
}

// GestureEvent type for macOS Safari
interface GestureEvent extends UIEvent {
    scale: number;
    rotation: number;
}

// Mermaid Setup
function setupMermaid() {
    const savedTheme = localStorage.getItem("obails-theme") || "github-light";
    const isDark = !LIGHT_THEMES.includes(savedTheme);

    mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? "dark" : "default",
        securityLevel: "loose",
        logLevel: "error"
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

async function initMermaidDiagrams() {
    const previewEl = document.getElementById("preview");
    if (!previewEl) return;

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

        // Create container
        const container = document.createElement("div");
        container.className = "mermaid-container";

        try {
            // Render mermaid diagram individually to catch errors per diagram
            const { svg } = await mermaid.render(`mermaid-${idx}`, text);

            const mermaidDiv = document.createElement("div");
            mermaidDiv.className = "mermaid";
            mermaidDiv.innerHTML = svg;
            mermaidDiv.title = "Click to view fullscreen";

            mermaidDiv.addEventListener("click", () => openMermaidFullscreen(mermaidDiv));
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

        pre.replaceWith(container);
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
        mermaidStartX = e.clientX - mermaidPanX;
        mermaidStartY = e.clientY - mermaidPanY;
    });

    document.addEventListener("mousemove", (e) => {
        if (!isMermaidPanning) return;
        mermaidPanX = e.clientX - mermaidStartX;
        mermaidPanY = e.clientY - mermaidStartY;
        updateMermaidTransform();
    });

    document.addEventListener("mouseup", () => {
        isMermaidPanning = false;
    });

    // Figma-style: Two-finger scroll = pan, Pinch = zoom
    fsContent.addEventListener("wheel", (e) => {
        if (!fsOverlay.classList.contains("visible")) return;
        e.preventDefault();

        if (e.ctrlKey) {
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
