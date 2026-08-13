import { describe, expect, it } from "vitest";
import { applySidebarVisibility, sidebarVisibilityForActivePane } from "../../lib/sidebar-visibility";

describe("sidebarVisibilityForActivePane", () => {
  it("shows the one shared sidebar for an active legacy markdown pane", () => {
    expect(sidebarVisibilityForActivePane("legacy", "legacy", "markdown")).toEqual({ sharedVisible: true });
  });

  it("keeps one shared sidebar across panes and hides it for binary files", () => {
    expect(sidebarVisibilityForActivePane("right", "legacy", "markdown")).toEqual({ sharedVisible: true });
    expect(sidebarVisibilityForActivePane("right", "legacy", null)).toEqual({ sharedVisible: false });
  });

  it("updates the sidebar and its resize handle without resolving either element from the active document", () => {
    const sidebar = document.createElement("aside");
    const resizeHandle = document.createElement("div");

    applySidebarVisibility(sidebar, resizeHandle, { sharedVisible: true });
    expect(sidebar.style.display).toBe("flex");
    expect(resizeHandle.style.display).toBe("block");

    applySidebarVisibility(sidebar, resizeHandle, { sharedVisible: false });
    expect(sidebar.style.display).toBe("none");
    expect(resizeHandle.style.display).toBe("none");
  });
});
