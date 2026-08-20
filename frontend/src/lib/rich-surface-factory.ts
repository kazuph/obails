import { renderIcon } from "./icons";

export type SaveConflictControls = {
  status: HTMLElement;
  message: HTMLElement;
  retryButton: HTMLButtonElement;
  reloadButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
};

export type RichSurface = {
  paneId: string;
  root: HTMLElement;
  editorContainer: HTMLElement;
  editor: HTMLTextAreaElement;
  editorLineGutter: HTMLElement;
  editorResizeHandle: HTMLElement;
  editorTitle: HTMLElement;
  savePulse: HTMLElement;
  markdownSaveConflict: SaveConflictControls;
  preview: HTMLElement;
  previewTitle: HTMLElement;
  noteSearch: HTMLElement;
  noteSearchInput: HTMLInputElement;
  noteSearchCount: HTMLElement;
  noteSearchPreviousButton: HTMLButtonElement;
  noteSearchNextButton: HTMLButtonElement;
  noteSearchCloseButton: HTMLButtonElement;
  linkSuggestions: HTMLElement;
  imageViewer: HTMLElement;
  imagePreview: HTMLImageElement;
  imageTitle: HTMLElement;
  imageFullscreenButton: HTMLButtonElement;
  audioViewer: HTMLElement;
  audioTitle: HTMLElement;
  audioPlayer: HTMLAudioElement;
  pdfViewer: HTMLElement;
  pdfContainerA: HTMLElement;
  pdfContainerB: HTMLElement;
  pdfTitle: HTMLElement;
  pdfViewModeButton: HTMLButtonElement;
  pdfPreviousPageButton: HTMLButtonElement;
  pdfPageInfo: HTMLElement;
  pdfNextPageButton: HTMLButtonElement;
  pdfZoomOutButton: HTMLButtonElement;
  pdfZoomInfo: HTMLElement;
  pdfZoomInButton: HTMLButtonElement;
  pdfFullscreenButton: HTMLButtonElement;
  htmlEditorContainer: HTMLElement;
  htmlEditor: HTMLTextAreaElement;
  htmlEditorLineGutter: HTMLElement;
  htmlEditorResizeHandle: HTMLElement;
  htmlPreview: HTMLIFrameElement;
  htmlEditorTitle: HTMLElement;
  htmlPreviewTitle: HTMLElement;
  htmlSaveConflict: SaveConflictControls;
  timelinePanel: HTMLElement;
  timelineInput: HTMLTextAreaElement;
  timelineSubmitButton: HTMLButtonElement;
  timelineList: HTMLElement;
  rightSidebarResizeHandle: HTMLElement;
  rightSidebar: HTMLElement;
  outlineToggleButton: HTMLButtonElement;
  outlineList: HTMLElement;
  outlineResizeHandle: HTMLElement;
  outgoingLinksToggleButton: HTMLButtonElement;
  outgoingLinksList: HTMLElement;
  outgoingLinksResizeHandle: HTMLElement;
  backlinksToggleButton: HTMLButtonElement;
  backlinksList: HTMLElement;
};

type Header = { root: HTMLElement; title: HTMLElement; controls: HTMLElement };
type SidebarSection = { root: HTMLElement; toggleButton: HTMLButtonElement; list: HTMLElement };

function element<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(
  documentRef: Document,
  ariaLabel: string,
  className?: string,
  text?: string,
): HTMLButtonElement {
  const node = element(documentRef, "button", className, text);
  node.type = "button";
  node.setAttribute("aria-label", ariaLabel);
  node.title = ariaLabel;
  return node;
}

function header(documentRef: Document, title: string): Header {
  const root = element(documentRef, "div", "pane-header");
  const titleNode = element(documentRef, "span", "pane-title", title);
  const controls = element(documentRef, "div", "pane-controls");
  root.append(titleNode, controls);
  return { root, title: titleNode, controls };
}

export function hideStandaloneWorkspaceNoteTitles(...titles: Array<HTMLElement | null | undefined>) {
  for (const title of titles) {
    if (!title) continue;
    title.classList.add("standalone-note-title");
    title.hidden = true;
    title.tabIndex = -1;
  }
}

export function hideLegacyRichSurfaceNoteTitles(root: ParentNode) {
  hideStandaloneWorkspaceNoteTitles(
    root.querySelector<HTMLElement>("#editor-title"),
    root.querySelector<HTMLElement>("#preview-title"),
  );
}

function saveConflictControls(documentRef: Document, className: string): SaveConflictControls {
  const status = element(documentRef, "span", className);
  status.setAttribute("role", "status");
  status.hidden = true;
  const message = element(documentRef, "span", `${className}-message`);
  const retryButton = button(documentRef, "Retry save", undefined, "Retry save");
  const reloadButton = button(documentRef, "Reload disk version", undefined, "Reload disk version");
  const closeButton = button(documentRef, "Close document", undefined, "Close document");
  retryButton.hidden = true;
  reloadButton.hidden = true;
  closeButton.hidden = true;
  status.append(message, retryButton, reloadButton, closeButton);
  return { status, message, retryButton, reloadButton, closeButton };
}

function sidebarSection(documentRef: Document, title: string, section: string): SidebarSection {
  const root = element(documentRef, "section", `sidebar-section ${section}-panel`);
  root.dataset.sidebarSection = section;
  const toggleButton = button(documentRef, `Toggle ${title}`, "sidebar-section-header", title);
  toggleButton.dataset.sidebarSectionToggle = section;
  toggleButton.setAttribute("aria-expanded", "true");
  const chevron = element(documentRef, "span", "sidebar-section-chevron");
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = renderIcon("chevron-down");
  toggleButton.append(chevron);
  const list = element(documentRef, "div", "sidebar-section-body");
  list.dataset.sidebarSectionContent = section;
  root.append(toggleButton, list);
  return { root, toggleButton, list };
}

function resizeHandle(documentRef: Document, orientation: "vertical" | "horizontal", ariaLabel: string): HTMLElement {
  const handle = element(documentRef, "div", `resize-handle ${orientation}`);
  handle.dataset.richSurfaceControl = "resize";
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", orientation);
  handle.setAttribute("aria-label", ariaLabel);
  return handle;
}

/**
 * Builds a complete rich document surface without cloning another pane's DOM.
 * Controllers receive direct references instead of global IDs, so every pane
 * can render and operate independently.
 */
export function createRichSurface(documentRef: Document, paneId: string): RichSurface {
  const root = element(documentRef, "section", "rich-surface");
  root.dataset.paneId = paneId;
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", `Document pane ${paneId}`);

  const editorContainer = element(documentRef, "div", "editor-container source-hidden");
  const editorPane = element(documentRef, "div", "editor-pane");
  const editorHeader = header(documentRef, "Select a note...");
  editorHeader.root.classList.add("editor-pane-header");
  editorHeader.title.setAttribute("role", "button");
  editorHeader.title.setAttribute("aria-label", "Rename current note");
  const markdownSaveConflict = saveConflictControls(documentRef, "save-status");
  const savePulse = element(documentRef, "span", "save-pulse");
  savePulse.setAttribute("aria-hidden", "true");
  editorHeader.controls.append(savePulse, markdownSaveConflict.status);

  const editorInputShell = element(documentRef, "div", "editor-input-shell");
  const editor = element(documentRef, "textarea");
  editor.setAttribute("aria-label", `Editor in pane ${paneId}`);
  editor.placeholder = "Select a note...";
  editor.dataset.fileDropTarget = "";
  editor.dataset.dropKind = "markdown-editor";
  const editorLineGutter = element(documentRef, "div", "editor-line-numbers");
  editorLineGutter.setAttribute("aria-hidden", "true");
  editorInputShell.append(editor, editorLineGutter);
  const linkSuggestions = element(documentRef, "div", "link-suggestions");
  linkSuggestions.hidden = true;
  linkSuggestions.setAttribute("role", "listbox");
  linkSuggestions.setAttribute("aria-label", "Wiki link suggestions");
  editorPane.append(editorHeader.root, editorInputShell, linkSuggestions);

  const editorResizeHandle = resizeHandle(documentRef, "vertical", "Resize editor");
  const previewPane = element(documentRef, "div", "preview-pane");
  const previewHeader = header(documentRef, "Preview");
  hideStandaloneWorkspaceNoteTitles(editorHeader.title, previewHeader.title);
  const noteSearch = element(documentRef, "div", "note-search");
  noteSearch.hidden = true;
  const noteSearchInput = element(documentRef, "input", "note-search-input") as HTMLInputElement;
  noteSearchInput.type = "search";
  noteSearchInput.placeholder = "Find in note";
  noteSearchInput.setAttribute("aria-label", "Find in note");
  const noteSearchCount = element(documentRef, "span", "note-search-count", "0/0");
  const noteSearchPreviousButton = button(documentRef, "Previous match");
  const noteSearchNextButton = button(documentRef, "Next match");
  const noteSearchCloseButton = button(documentRef, "Close find");
  noteSearch.append(
    noteSearchInput,
    noteSearchCount,
    noteSearchPreviousButton,
    noteSearchNextButton,
    noteSearchCloseButton,
  );
  previewHeader.controls.append(noteSearch);
  const preview = element(documentRef, "div", "preview-content");
  previewPane.append(previewHeader.root, preview);
  editorContainer.append(editorPane, editorResizeHandle, previewPane);

  const imageViewer = element(documentRef, "section", "image-viewer");
  imageViewer.style.display = "none";
  const imageHeader = header(documentRef, "Image");
  const imageFullscreenButton = button(documentRef, "View image fullscreen");
  imageFullscreenButton.dataset.richSurfaceControl = "image-fullscreen";
  imageHeader.controls.append(imageFullscreenButton);
  const imageContainer = element(documentRef, "div", "image-container");
  const imagePreview = element(documentRef, "img");
  imagePreview.alt = "Preview";
  imageContainer.append(imagePreview);
  imageViewer.append(imageHeader.root, imageContainer);

  const audioViewer = element(documentRef, "section", "audio-viewer");
  audioViewer.style.display = "none";
  const audioHeader = header(documentRef, "Audio");
  const audioPlayer = element(documentRef, "audio") as HTMLAudioElement;
  audioPlayer.controls = true;
  audioPlayer.preload = "metadata";
  audioPlayer.setAttribute("aria-label", "Audio player");
  audioViewer.append(audioHeader.root, audioPlayer);

  const pdfViewer = element(documentRef, "section", "pdf-viewer");
  pdfViewer.style.display = "none";
  const pdfHeader = header(documentRef, "PDF");
  const pdfControls = element(documentRef, "div", "pdf-controls");
  const pdfViewModeButton = button(documentRef, "Toggle PDF view mode");
  const pdfPreviousPageButton = button(documentRef, "Previous PDF page");
  const pdfPageInfo = element(documentRef, "span", "pdf-page-info", "1 / 1");
  const pdfNextPageButton = button(documentRef, "Next PDF page");
  const pdfZoomOutButton = button(documentRef, "Zoom out PDF");
  const pdfZoomInfo = element(documentRef, "span", "pdf-zoom-info", "100%");
  const pdfZoomInButton = button(documentRef, "Zoom in PDF");
  const pdfFullscreenButton = button(documentRef, "View PDF fullscreen");
  pdfControls.append(
    pdfViewModeButton,
    pdfPreviousPageButton,
    pdfPageInfo,
    pdfNextPageButton,
    pdfZoomOutButton,
    pdfZoomInfo,
    pdfZoomInButton,
    pdfFullscreenButton,
  );
  pdfHeader.controls.append(pdfControls);
  const pdfWrapper = element(documentRef, "div", "pdf-container-wrapper");
  const pdfContainerA = element(documentRef, "div", "pdf-container pdf-buffer-active");
  const pdfContainerB = element(documentRef, "div", "pdf-container pdf-buffer-back");
  pdfWrapper.append(pdfContainerA, pdfContainerB);
  pdfViewer.append(pdfHeader.root, pdfWrapper);

  const htmlEditorContainer = element(documentRef, "section", "html-editor-container");
  htmlEditorContainer.style.display = "none";
  const htmlEditorPane = element(documentRef, "div", "editor-pane");
  const htmlHeader = header(documentRef, "HTML");
  const htmlSaveConflict = saveConflictControls(documentRef, "html-save-status");
  htmlHeader.controls.append(htmlSaveConflict.status);
  const htmlInputShell = element(documentRef, "div", "editor-input-shell");
  const htmlEditor = element(documentRef, "textarea");
  htmlEditor.setAttribute("aria-label", `HTML editor in pane ${paneId}`);
  htmlEditor.placeholder = "HTML content...";
  const htmlEditorLineGutter = element(documentRef, "div", "editor-line-numbers");
  htmlEditorLineGutter.setAttribute("aria-hidden", "true");
  htmlInputShell.append(htmlEditor, htmlEditorLineGutter);
  htmlEditorPane.append(htmlHeader.root, htmlInputShell);
  const htmlEditorResizeHandle = resizeHandle(documentRef, "vertical", "Resize HTML editor");
  const htmlPreviewPane = element(documentRef, "div", "preview-pane");
  const htmlPreviewHeader = header(documentRef, "Preview");
  const htmlPreview = element(documentRef, "iframe");
  htmlPreview.title = "HTML Preview";
  htmlPreview.setAttribute("sandbox", "allow-same-origin");
  htmlPreviewPane.append(htmlPreviewHeader.root, htmlPreview);
  htmlEditorContainer.append(htmlEditorPane, htmlEditorResizeHandle, htmlPreviewPane);

  const timelinePanel = element(documentRef, "section", "timeline-panel");
  timelinePanel.style.display = "none";
  const timelineInputContainer = element(documentRef, "div", "timeline-input");
  const timelineInput = element(documentRef, "textarea");
  timelineInput.placeholder = "What's on your mind?";
  timelineInput.setAttribute("aria-label", "New timeline entry");
  const timelineSubmitButton = button(documentRef, "Post", undefined, "Post");
  timelineInputContainer.append(timelineInput, timelineSubmitButton);
  const timelineList = element(documentRef, "div", "timeline-list");
  timelinePanel.append(timelineInputContainer, timelineList);

  const rightSidebarResizeHandle = resizeHandle(documentRef, "vertical", "Resize right sidebar");
  const rightSidebar = element(documentRef, "aside", "right-sidebar");
  const outline = sidebarSection(documentRef, "Outline", "outline");
  const outlineResizeHandle = resizeHandle(documentRef, "horizontal", "Resize outline");
  const outgoing = sidebarSection(documentRef, "Outgoing Links", "outgoing");
  const outgoingLinksResizeHandle = resizeHandle(documentRef, "horizontal", "Resize outgoing links");
  const backlinks = sidebarSection(documentRef, "Backlinks", "backlinks");
  rightSidebar.append(
    outline.root,
    outlineResizeHandle,
    outgoing.root,
    outgoingLinksResizeHandle,
    backlinks.root,
  );

  root.append(
    editorContainer,
    imageViewer,
    audioViewer,
    pdfViewer,
    htmlEditorContainer,
    timelinePanel,
    rightSidebarResizeHandle,
    rightSidebar,
  );
  return {
    paneId,
    root,
    editorContainer,
    editor,
    editorLineGutter,
    editorResizeHandle,
    editorTitle: editorHeader.title,
    savePulse,
    markdownSaveConflict,
    preview,
    previewTitle: previewHeader.title,
    noteSearch,
    noteSearchInput,
    noteSearchCount,
    noteSearchPreviousButton,
    noteSearchNextButton,
    noteSearchCloseButton,
    linkSuggestions,
    imageViewer,
    imagePreview,
    imageTitle: imageHeader.title,
    imageFullscreenButton,
    audioViewer,
    audioTitle: audioHeader.title,
    audioPlayer,
    pdfViewer,
    pdfContainerA,
    pdfContainerB,
    pdfTitle: pdfHeader.title,
    pdfViewModeButton,
    pdfPreviousPageButton,
    pdfPageInfo,
    pdfNextPageButton,
    pdfZoomOutButton,
    pdfZoomInfo,
    pdfZoomInButton,
    pdfFullscreenButton,
    htmlEditorContainer,
    htmlEditor,
    htmlEditorLineGutter,
    htmlEditorResizeHandle,
    htmlPreview,
    htmlEditorTitle: htmlHeader.title,
    htmlPreviewTitle: htmlPreviewHeader.title,
    htmlSaveConflict,
    timelinePanel,
    timelineInput,
    timelineSubmitButton,
    timelineList,
    rightSidebarResizeHandle,
    rightSidebar,
    outlineToggleButton: outline.toggleButton,
    outlineList: outline.list,
    outlineResizeHandle,
    outgoingLinksToggleButton: outgoing.toggleButton,
    outgoingLinksList: outgoing.list,
    outgoingLinksResizeHandle,
    backlinksToggleButton: backlinks.toggleButton,
    backlinksList: backlinks.list,
  };
}
