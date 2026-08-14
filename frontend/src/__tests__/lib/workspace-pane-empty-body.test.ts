import { describe, expect, it } from "vitest";
import { createEmptyPaneBody } from "../../lib/workspace-pane-empty-body";
import { EMPTY_PANE_INSTRUCTION } from "../../lib/workspace-pane-identity";

describe("createEmptyPaneBody", () => {
  it("renders the Explorer instruction once as a keyboard-operable button and activates the exact pane on click", () => {
    const activations: string[] = [];
    const body = createEmptyPaneBody(document, "pane-new", (paneId) => activations.push(paneId));

    expect(body.tagName).toBe("BUTTON");
    expect(body.className).toBe("workspace-pane-empty-body");
    expect(body.textContent).toBe(EMPTY_PANE_INSTRUCTION);
    expect(body.getAttribute("aria-label")).toBe(EMPTY_PANE_INSTRUCTION);
    expect(body.title).toBe(EMPTY_PANE_INSTRUCTION);
    expect(body.dataset.paneId).toBe("pane-new");
    expect(body.textContent).not.toContain("Empty pane");

    body.click();
    expect(activations).toEqual(["pane-new"]);
  });
});
