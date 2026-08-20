import { describe, expect, it } from "vitest";
import { renderIcon, setButtonIcon, setButtonIconWithLabel, type IconName } from "../../lib/icons";

const FILE_TYPE_ICONS: IconName[] = [
  "file",
  "file-text",
  "file-image",
  "file-pdf",
  "file-code",
  "file-audio",
];

const ACTION_ICONS: IconName[] = [
  "file-plus",
  "folder-plus",
  "external-link",
  "copy",
  "trash",
  "page-single",
  "page-continuous",
  "split-right",
  "split-down",
  "chevron-down",
  "arrow-up-down",
  "chevrons-down-up",
  "chevrons-up-down",
  "check",
];

describe("icons", () => {
  it("renders svg markup for known icons", () => {
    expect(renderIcon("edit")).toContain("<svg");
    expect(renderIcon("folder-open")).toContain("<svg");
  });

  it("keeps aria-label and title when injecting an icon", () => {
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Split pane right");
    button.title = "Split pane right";
    setButtonIcon(button, "split-right");
    expect(button.getAttribute("aria-label")).toBe("Split pane right");
    expect(button.title).toBe("Split pane right");
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("keeps a visible text label beside an action icon", () => {
    const button = document.createElement("button");
    setButtonIconWithLabel(button, "external-link", "Rejoin");

    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.querySelector(".toolbar-button-label")?.textContent).toBe("Rejoin");
    expect(button.textContent).toBe("Rejoin");
  });

  it("renders every file-type icon as inline SVG (no emoji)", () => {
    for (const name of FILE_TYPE_ICONS) {
      const svg = renderIcon(name);
      expect(svg, name).toContain("<svg");
      expect(svg, name).toContain("</svg>");
    }
  });

  it("renders every action icon as inline SVG (no emoji)", () => {
    for (const name of ACTION_ICONS) {
      const svg = renderIcon(name);
      expect(svg, name).toContain("<svg");
      expect(svg, name).toContain("</svg>");
    }
  });

  it("uses currentColor so icons follow the active theme", () => {
    for (const name of [...FILE_TYPE_ICONS, ...ACTION_ICONS]) {
      expect(renderIcon(name), name).toContain("currentColor");
    }
  });

  it("uses Lucide Columns2 and Rows2 path data for split icons", () => {
    expect(renderIcon("split-right")).toContain('width="18" height="18" x="3" y="3" rx="2"');
    expect(renderIcon("split-right")).toContain('d="M12 3v18"');
    expect(renderIcon("split-down")).toContain('width="18" height="18" x="3" y="3" rx="2"');
    expect(renderIcon("split-down")).toContain('d="M3 12h18"');
    expect(renderIcon("split-right")).not.toContain("<line");
    expect(renderIcon("split-down")).not.toContain("<line");
  });
});
