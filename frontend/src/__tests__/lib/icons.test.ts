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
];

describe("icons", () => {
  it("renders svg markup for known icons", () => {
    expect(renderIcon("edit")).toContain("<svg");
    expect(renderIcon("folder-open")).toContain("<svg");
  });

  it("sets button inner html", () => {
    const button = document.createElement("button");
    setButtonIcon(button, "refresh");
    expect(button.innerHTML).toContain("<svg");
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
});
