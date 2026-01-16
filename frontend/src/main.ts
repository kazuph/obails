import * as ConfigService from "../bindings/github.com/kazuph/obails/services/configservice.js";
import * as FileService from "../bindings/github.com/kazuph/obails/services/fileservice.js";
import * as NoteService from "../bindings/github.com/kazuph/obails/services/noteservice.js";
import * as LinkService from "../bindings/github.com/kazuph/obails/services/linkservice.js";
import * as WindowService from "../bindings/github.com/kazuph/obails/services/windowservice.js";
import { FileInfo, Note, Thino, Backlink, Config } from "../bindings/github.com/kazuph/obails/models/models.js";
import { toHtml } from "@mizchi/markdown";
import mermaid from "mermaid";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

// Theme constants
const LIGHT_THEMES = ["github-light", "solarized-light", "one-light", "catppuccin-latte", "rosepine-dawn"];

// State
let currentNote: Note | null = null;
let showThino = false;

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
        }
    } catch (err) {
        console.warn("Running in browser mode - backend services unavailable");
    }

    setupEventListeners();
}

// Event Listeners
function setupEventListeners() {
    document.getElementById("settings-btn")!.addEventListener("click", openSettings);
    document.getElementById("daily-note-btn")!.addEventListener("click", openTodayNote);
    document.getElementById("thino-btn")!.addEventListener("click", toggleThino);
    document.getElementById("refresh-btn")!.addEventListener("click", refresh);
    document.getElementById("thino-submit")!.addEventListener("click", submitThino);

    editor.addEventListener("input", debounce(saveCurrentNote, 500));
    editor.addEventListener("input", updatePreview);

    // Cmd+, to open settings
    document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === ",") {
            e.preventDefault();
            openSettings();
        }
    });

    setupResizeHandles();
    setupThemeSelector();
}

// Settings
async function openSettings() {
    try {
        await ConfigService.OpenConfigFile();
    } catch (err) {
        console.error("Failed to open settings:", err);
    }
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

    const icon = file.isDir ? "📁" : "📄";
    const arrow = file.isDir && file.children && file.children.length > 0 ? "▶" : "";
    el.innerHTML = `<span class="folder-arrow">${arrow}</span><span>${icon}</span><span>${file.name}</span>`;

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
            const arrowSpan = el.querySelector(".folder-arrow");
            if (arrowSpan) {
                arrowSpan.textContent = el.classList.contains("expanded") ? "▼" : "▶";
            }
            if (childrenEl) {
                childrenEl.style.display = childrenEl.style.display === "none" ? "block" : "none";
            }
        });
    } else if (file.name.endsWith(".md")) {
        el.addEventListener("click", () => openNote(file.path));
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
    const headings: { level: number; text: string; line: number }[] = [];
    const lines = content.split("\n");

    lines.forEach((line, index) => {
        const match = line.match(/^(#{1,6})\s+(.+)/);
        if (match) {
            headings.push({
                level: match[1].length,
                text: match[2].trim(),
                line: index
            });
        }
    });

    outlineList.innerHTML = headings.map(h => `
        <div class="outline-item h${h.level}" data-line="${h.line}">
            ${h.text}
        </div>
    `).join("");

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

function parseMarkdown(content: string): string {
    // Use @mizchi/markdown for parsing
    let html = toHtml(content);

    // Post-process: Convert wiki links [[link]] or [[link|alias]]
    html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, alias) => {
        const displayText = alias || link;
        return `<span class="wiki-link" data-link="${link}">${displayText}</span>`;
    });

    return html;
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

function renderBacklinks(backlinks: Backlink[]) {
    backlinksList.innerHTML = "";

    for (const bl of backlinks) {
        const el = document.createElement("div");
        el.className = "backlink-item";
        el.innerHTML = `
            <div class="backlink-title">${bl.sourceTitle}</div>
            <div class="backlink-context">${bl.context}</div>
        `;
        el.addEventListener("click", () => openNote(bl.sourcePath));
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

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
    let timeoutId: number;
    return ((...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => fn(...args), delay);
    }) as T;
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
    const minimapMaxWidth = 184;
    const minimapMaxHeight = 134;
    mermaidMinimapScale = Math.min(minimapMaxWidth / naturalWidth, minimapMaxHeight / naturalHeight);

    clonedSvg.style.width = naturalWidth + "px";
    clonedSvg.style.height = naturalHeight + "px";

    // Calculate fit-to-viewport zoom
    const viewportHeight = window.innerHeight - 80;
    const viewportWidth = window.innerWidth - 40;

    const fitZoom = Math.min(viewportHeight / naturalHeight, viewportWidth / naturalWidth);
    mermaidZoom = fitZoom;
    mermaidInitialZoom = fitZoom;

    // Center the SVG
    const scaledWidth = naturalWidth * mermaidZoom;
    const scaledHeight = naturalHeight * mermaidZoom;
    mermaidPanX = (viewportWidth - scaledWidth) / 2 + 20;
    mermaidPanY = (viewportHeight - scaledHeight) / 2 + 60;

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
    mermaidZoom = Math.max(0.1, Math.min(10, mermaidZoom * factor));

    const rect = fsContent.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const zoomRatio = mermaidZoom / oldZoom;
    mermaidPanX = mouseX - (mouseX - mermaidPanX) * zoomRatio;
    mermaidPanY = mouseY - (mouseY - mermaidPanY) * zoomRatio;

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
        const scaledWidth = mermaidSvgWidth * mermaidZoom;
        const scaledHeight = mermaidSvgHeight * mermaidZoom;
        mermaidPanX = (viewportWidth - scaledWidth) / 2 + 20;
        mermaidPanY = (viewportHeight - scaledHeight) / 2 + 60;
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
