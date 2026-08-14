import { EMPTY_PANE_INSTRUCTION } from "./workspace-pane-identity";

export function createEmptyPaneBody(
  documentRef: Document,
  paneId: string,
  activatePane: (paneId: string) => void,
): HTMLElement {
  const body = documentRef.createElement("button");
  body.type = "button";
  body.className = "workspace-pane-empty-body";
  body.dataset.paneId = paneId;
  body.textContent = EMPTY_PANE_INSTRUCTION;
  body.setAttribute("aria-label", EMPTY_PANE_INSTRUCTION);
  body.title = EMPTY_PANE_INSTRUCTION;
  body.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.detail > 1) return;
    activatePane(paneId);
  });
  return body;
}
