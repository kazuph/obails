import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorkspacePaneTabStrip } from "../../lib/workspace-pane-tab-strip";

const mainCss = readFileSync(resolve(__dirname, "../../../src/styles/main.css"), "utf8");

const WORKSPACE_PANE_TAB_CHROME_SELECTORS = [
  ".workspace-pane-tabs",
  ".workspace-pane-tab-group",
  ".workspace-pane-tab",
  ".workspace-pane-tab-title",
  ".workspace-pane-tab-close",
  ".workspace-pane-empty",
] as const;

const WORKSPACE_PANE_TAB_CHROME_VARS = [
  "--radius-s",
  "--border",
  "--bg-secondary",
  "--bg-tertiary",
  "--text-secondary",
  "--text-primary",
  "--accent",
] as const;

function extractWorkspacePaneTabChromeCss(fullCss: string): string {
  const varLines = WORKSPACE_PANE_TAB_CHROME_VARS
    .map((name) => {
      const match = fullCss.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*[^;]+;`));
      return match ? `  ${match[0]}` : "";
    })
    .filter(Boolean)
    .join("\n");
  const rootBlock = `:root {\n${varLines}\n}`;

  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of fullCss.matchAll(rulePattern)) {
    const selector = match[1].trim();
    const matchesChrome = WORKSPACE_PANE_TAB_CHROME_SELECTORS.some((prefix) => selector.includes(prefix));
    if (matchesChrome) {
      blocks.push(`${selector} {${match[2]}}`);
    }
  }

  return `${rootBlock}\n${blocks.join("\n")}`;
}

const workspacePaneTabChromeCss = extractWorkspacePaneTabChromeCss(mainCss);

function parseCssLength(raw: string, fontSize = 16): number {
  const value = raw.trim();
  if (!value || value === "auto" || value === "none") {
    return 0;
  }
  if (value.endsWith("px")) {
    return Number.parseFloat(value);
  }
  if (value.endsWith("rem")) {
    return Number.parseFloat(value) * fontSize;
  }
  return Number.parseFloat(value) || 0;
}

function horizontalPadding(style: CSSStyleDeclaration, fontSize: number): number {
  return parseCssLength(style.paddingLeft, fontSize) + parseCssLength(style.paddingRight, fontSize);
}

function verticalSize(style: CSSStyleDeclaration, fontSize: number): number {
  return parseCssLength(style.height, fontSize)
    || parseCssLength(style.minHeight, fontSize)
    || parseCssLength(style.lineHeight, fontSize);
}

function injectWorkspacePaneTabStyles(): void {
  const style = document.createElement("style");
  style.textContent = workspacePaneTabChromeCss;
  document.head.append(style);
}

function measureTabChromeLayout(strip: HTMLElement): {
  stripRight: number;
  closeRight: number;
  titleCenterY: number;
  closeCenterY: number;
  verticalTolerance: number;
} {
  const fontSize = parseCssLength(getComputedStyle(document.documentElement).fontSize, 16);
  const container = strip.parentElement!;
  const containerStyle = getComputedStyle(container);
  const stripStyle = getComputedStyle(strip);
  const tab = strip.querySelector<HTMLElement>(".workspace-pane-tab")!;
  const title = tab.querySelector<HTMLElement>(".workspace-pane-tab-title")!;
  const close = tab.querySelector<HTMLElement>(".workspace-pane-tab-close")!;
  const tabStyle = getComputedStyle(tab);
  const titleStyle = getComputedStyle(title);
  const closeStyle = getComputedStyle(close);

  const containerWidth = parseCssLength(containerStyle.width, fontSize);
  const stripPad = horizontalPadding(stripStyle, fontSize);
  const stripInnerWidth = stripStyle.width.endsWith("%")
    ? containerWidth * (Number.parseFloat(stripStyle.width) / 100) - stripPad
    : parseCssLength(stripStyle.width, fontSize) - stripPad;
  const tabPad = horizontalPadding(tabStyle, fontSize);
  const gap = parseCssLength(tabStyle.gap, fontSize);
  const closeBoxWidth = parseCssLength(closeStyle.width, fontSize) + horizontalPadding(closeStyle, fontSize);
  const titlePad = horizontalPadding(titleStyle, fontSize);
  const tabWidth = Math.min(stripInnerWidth, parseCssLength(tabStyle.maxWidth, fontSize) || stripInnerWidth);
  const innerTabWidth = tabWidth - tabPad;
  const titleWidth = Math.max(0, innerTabWidth - closeBoxWidth - gap - titlePad);
  const stripPadLeft = parseCssLength(stripStyle.paddingLeft, fontSize);
  const closeRight = stripPadLeft + tabWidth - parseCssLength(tabStyle.paddingRight, fontSize);
  const titleHeight = verticalSize(titleStyle, fontSize);
  const closeHeight = verticalSize(closeStyle, fontSize);
  const verticalTolerance = Math.max(titleHeight, closeHeight) / 2;

  return {
    stripRight: containerWidth - parseCssLength(stripStyle.paddingRight, fontSize),
    closeRight,
    titleCenterY: titleHeight / 2,
    closeCenterY: closeHeight / 2,
    verticalTolerance,
  };
}

describe("createWorkspacePaneTabStrip", () => {
  injectWorkspacePaneTabStyles();

  it("keeps each tab strip in its exact pane and routes activation and close by that pane id", () => {
    const operations: string[] = [];
    const left = createWorkspacePaneTabStrip(document, "generated-left-pane", {
      paneId: "generated-left-pane",
      tabs: [{ path: "note-a.md", fileType: "markdown" }],
      activeTabPath: "note-a.md",
    }, "generated-left-pane", (path) => path, {
      activateTab: (paneId, path) => operations.push(`activate:${paneId}:${path}`),
      closeTab: (paneId, path) => operations.push(`close:${paneId}:${path}`),
      renameTab: (paneId, path) => operations.push(`rename:${paneId}:${path}`),
    });
    const right = createWorkspacePaneTabStrip(document, "right", {
      paneId: "right",
      tabs: [{ path: "right.md", fileType: "markdown" }],
      activeTabPath: "right.md",
    }, "left", (path) => path, {
      activateTab: (paneId, path) => operations.push(`activate:${paneId}:${path}`),
      closeTab: (paneId, path) => operations.push(`close:${paneId}:${path}`),
      renameTab: (paneId, path) => operations.push(`rename:${paneId}:${path}`),
    });

    expect(left.dataset.paneId).toBe("generated-left-pane");
    expect(right.dataset.paneId).toBe("right");
    expect(left.getAttribute("role")).toBe("group");
    expect(left.getAttribute("aria-label")).toBe("Tabs in pane generated-left-pane");
    expect(left.textContent).not.toContain("generated-left-pane");
    expect(left.querySelector(".workspace-pane-tab")?.getAttribute("role")).toBeNull();
    expect(left.querySelector(".workspace-pane-tab-title")?.getAttribute("role")).toBeNull();
    expect(left.querySelector(".workspace-pane-tab-title")?.getAttribute("aria-label")).toBe("Tab note-a.md");
    expect(right.querySelector<HTMLButtonElement>(".workspace-pane-tab-close")?.getAttribute("aria-label"))
      .toBe("Close right.md in right");
    expect(right.querySelector<HTMLButtonElement>(".workspace-pane-tab-close")?.textContent).toBe("×");
    (left.querySelector<HTMLElement>(".workspace-pane-tab-title")!).click();
    (right.querySelector<HTMLElement>(".workspace-pane-tab-close")!).click();
    expect(operations).toEqual(["activate:generated-left-pane:note-a.md", "close:right:right.md"]);
    expect(right.querySelector<HTMLButtonElement>(".workspace-pane-tab-close")?.title).toBe("Close right.md in right");
  });

  it("renders an accessible empty pane without an internal pane id button", () => {
    const operations: string[] = [];
    const strip = createWorkspacePaneTabStrip(document, "generated-pane", { paneId: "generated-pane", tabs: [] }, "generated-pane", (path) => path, {
      activateTab: () => {},
      closeTab: () => {},
      renameTab: () => {},
      activatePane: (paneId) => operations.push(`focus:${paneId}`),
    });
    expect(strip.textContent).toBe("Open a note from Explorer");
    expect(strip.querySelector("button")).toBeNull();
    expect(strip.querySelector(".workspace-pane-empty")?.getAttribute("aria-label")).toBe("Empty pane. Open a note from Explorer");
    expect(strip.querySelector(".workspace-pane-empty")?.getAttribute("title")).toBe("Empty pane. Open a note from Explorer");
    strip.querySelector<HTMLElement>(".workspace-pane-empty")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(operations).toEqual(["focus:generated-pane"]);
  });

  it("keeps at least 10ch of the title visible and scrolls the strip instead of crushing tabs", () => {
    const container = document.createElement("div");
    container.style.width = "180px";
    container.style.overflow = "hidden";
    document.body.append(container);

    const longTitle = "read-false-important-false-source-vault-note-very-long-tab-title.md";
    const strip = createWorkspacePaneTabStrip(document, "pane-a", {
      paneId: "pane-a",
      tabs: [
        { path: longTitle, fileType: "markdown" },
        { path: "second-long-note-name.md", fileType: "markdown" },
      ],
      activeTabPath: longTitle,
    }, "pane-a", (path) => path, {
      activateTab: () => {},
      closeTab: () => {},
      renameTab: () => {},
    });
    container.append(strip);

    const tab = strip.querySelector<HTMLElement>(".workspace-pane-tab")!;
    const title = tab.querySelector<HTMLElement>(".workspace-pane-tab-title")!;
    const close = tab.querySelector<HTMLElement>(".workspace-pane-tab-close")!;
    const titleStyle = getComputedStyle(title);
    const closeStyle = getComputedStyle(close);
    const tabStyle = getComputedStyle(tab);
    const stripStyle = getComputedStyle(strip);
    const layout = measureTabChromeLayout(strip);

    expect(stripStyle.overflowX).toBe("auto");
    expect(stripStyle.flexWrap).toBe("nowrap");
    expect(getComputedStyle(strip).minWidth === "max-content" || getComputedStyle(strip).width === "max-content").toBe(true);
    expect(tabStyle.flexShrink).toBe("0");
    expect(titleStyle.minWidth).toBe("10ch");
    expect(titleStyle.maxWidth).toBe("28ch");
    expect(titleStyle.overflow).toBe("hidden");
    expect(titleStyle.textOverflow).toBe("ellipsis");
    expect(title.title).toBe(longTitle);
    expect(closeStyle.flexShrink).toBe("0");
    expect(Math.abs(layout.titleCenterY - layout.closeCenterY))
      .toBeLessThanOrEqual(layout.verticalTolerance);
    // jsdom lacks real layout; contract is CSS that forces content-sized tabs + strip scroll.
    expect(strip.className).toContain("workspace-pane-tabs");
    expect(strip.querySelectorAll(".workspace-pane-tab").length).toBe(2);

    container.remove();
  });
});
