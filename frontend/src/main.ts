import * as ConfigService from "../bindings/github.com/kazuph/obails/services/configservice.js";
import * as FileService from "../bindings/github.com/kazuph/obails/services/fileservice.js";
import * as NoteService from "../bindings/github.com/kazuph/obails/services/noteservice.js";
import * as LinkService from "../bindings/github.com/kazuph/obails/services/linkservice.js";
import * as WindowService from "../bindings/github.com/kazuph/obails/services/windowservice.js";
import { FileInfo, Note, Thino, Backlink, Config } from "../bindings/github.com/kazuph/obails/models/models.js";
import mermaid from "mermaid";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
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

// State
let currentNote: Note | null = null;
let showThino = false;
let contextMenuTargetPath: string = "";
let contextMenuTargetIsDir: boolean = false;
let draggedFilePath: string | null = null;

// DOM Elements
const fileTree = document.getElementById("file-tree")!;
const editor = document.getElementById("editor") as HTMLTextAreaElement;
const preview = document.getElementById("preview")!;
const thinoPanel = document.getElementById("thino-panel")!;
const editorContainer = document.querySelector(".editor-container") as HTMLElement;
const thinoInput = document.getElementById("thino-input") as HTMLTextAreaElement;
const thinoTimeline = document.getElementById("thino-timeline")!;
const backlinksList = document.getElementById("backlinks-list")!;
const outlineList = document.getElementById("outline-list")!;

// Initialize
async function init() {
    try {
        const config = await ConfigService.GetConfig();
        if (config?.Vault?.Path) {
            await loadFileTree();

            // Open last file if exists
            const lastFile = localStorage.getItem("obails-last-file");
            if (lastFile) {
                try {
                    await openNote(lastFile);
                } catch {
                    // File might have been deleted, clear the storage
                    localStorage.removeItem("obails-last-file");
                }
            }
        }
    } catch (err) {
        console.warn("Running in browser mode - backend services unavailable");
    }

    setupEventListeners();
}

// Event Listeners
function setupEventListeners() {
    document.getElementById("settings-btn")!.addEventListener("click", openSettings);
    document.getElementById("new-note-btn")!.addEventListener("click", showNewNoteForm);
    document.getElementById("daily-note-btn")!.addEventListener("click", openTodayNote);
    document.getElementById("thino-btn")!.addEventListener("click", toggleThino);
    document.getElementById("refresh-btn")!.addEventListener("click", refresh);
    document.getElementById("thino-submit")!.addEventListener("click", submitThino);

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
    });

    setupResizeHandles();
    setupThemeSelector();
    setupContextMenu();
    setupFileTreeDropTarget();
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

    // Hide context menu on click elsewhere
    document.addEventListener("click", () => {
        hideContextMenu();
    });

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
            localStorage.setItem("obails-last-file", newPath!);
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

    const icon = file.isDir ? (file.children && file.children.length > 0 ? "📁" : "📂") : "📄";
    el.innerHTML = `<span class="folder-icon">${icon}</span><span>${file.name}</span>`;

    // Make files draggable (not folders for now)
    if (!file.isDir && file.name.endsWith(".md")) {
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
    } else if (file.name.endsWith(".md")) {
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            openNote(file.path);
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

            // Save last opened file to localStorage
            localStorage.setItem("obails-last-file", path);
        }

        // Hide thino, show editor
        showThino = false;
        thinoPanel.style.display = "none";
        editorContainer.style.display = "flex";

        // Update file tree selection
        document.querySelectorAll(".file-item").forEach(el => el.classList.remove("active"));
    } catch (err) {
        console.error("Failed to open note:", err);
    }
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
        }

        showThino = false;
        thinoPanel.style.display = "none";
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
    // Scroll to position
    const lineHeight = 20; // approximate
    editor.scrollTop = lineNumber * lineHeight - editor.clientHeight / 3;
}


// Thino
function toggleThino() {
    showThino = !showThino;
    if (showThino) {
        thinoPanel.style.display = "block";
        editorContainer.style.display = "none";
        loadThinos();
    } else {
        thinoPanel.style.display = "none";
        editorContainer.style.display = "flex";
    }
}

async function loadThinos() {
    try {
        const thinos = await NoteService.GetTodayThinos();
        renderThinos(thinos);
    } catch (err) {
        console.error("Failed to load thinos:", err);
        thinoTimeline.innerHTML = '<div class="error">No thinos for today</div>';
    }
}

function renderThinos(thinos: Thino[]) {
    thinoTimeline.innerHTML = "";

    for (const thino of [...thinos].reverse()) {
        const el = document.createElement("div");
        el.className = "thino-item";
        el.innerHTML = `
            <div class="thino-time">${thino.time}</div>
            <div class="thino-content">${thino.content}</div>
        `;
        thinoTimeline.appendChild(el);
    }

    if (thinos.length === 0) {
        thinoTimeline.innerHTML = '<div class="empty">No memos yet. Start writing!</div>';
    }
}

async function submitThino() {
    const content = thinoInput.value.trim();
    if (!content) return;

    try {
        await NoteService.AddThino(content);
        thinoInput.value = "";
        await loadThinos();
    } catch (err) {
        console.error("Failed to add thino:", err);
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

// Resize Panels
function setupResizeHandles() {
    const sidebar = document.getElementById("sidebar")!;
    const sidebarResize = document.getElementById("sidebar-resize")!;
    const editorPane = document.getElementById("editor-pane")!;
    const editorResize = document.getElementById("editor-resize")!;
    const outlinePanel = document.getElementById("outline-panel")!;
    const backlinksPanel = document.getElementById("backlinks-panel")!;
    const rightSidebarResize = document.getElementById("right-sidebar-resize")!;

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
    rightSidebarResize.addEventListener("mousedown", (e) => {
        isResizingRightSidebar = true;
        rightSidebarResize.classList.add("dragging");
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
        rightSidebarResize.classList.remove("dragging");
    });
}

// Utilities
async function refresh() {
    await loadFileTree();
    await LinkService.RebuildIndex();
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

function initMermaidDiagrams() {
    const previewEl = document.getElementById("preview");
    if (!previewEl) return;

    const codeBlocks = previewEl.querySelectorAll("pre code");
    const errorToast = document.getElementById("mermaid-error-toast")!;

    codeBlocks.forEach((code, idx) => {
        const pre = code.parentElement;
        if (!pre) return;

        const text = code.textContent?.trim() || "";

        // Check if it's mermaid content
        const isMermaid = code.classList.contains("language-mermaid") ||
            text.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline)/);

        if (!isMermaid) return;

        // Create container
        const container = document.createElement("div");
        container.className = "mermaid-container";
        container.title = "Click to view fullscreen";

        const mermaidDiv = document.createElement("div");
        mermaidDiv.className = "mermaid";
        mermaidDiv.id = `mermaid-${idx}`;
        mermaidDiv.textContent = text;

        container.addEventListener("click", () => openMermaidFullscreen(mermaidDiv));
        container.appendChild(mermaidDiv);
        pre.replaceWith(container);
    });

    // Render all mermaid diagrams
    mermaid.run().catch(err => {
        errorToast.textContent = "Mermaid Error: " + (err.message || err);
        errorToast.classList.add("visible");
        setTimeout(() => errorToast.classList.remove("visible"), 5000);
    });
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
