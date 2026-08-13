import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CAPTURE = path.join(REPO, ".artifacts/obails-major-features-review/scripts/capture-major-features-v2.ts");
const AX_SWIFT = path.join(REPO, "e2e/helpers/wails-ax.swift");

describe("major-feature capture path contracts (offline)", () => {
  const script = readFileSync(CAPTURE, "utf8");
  const ax = readFileSync(AX_SWIFT, "utf8");

  it("bans System Events keystrokes for app hotkeys", () => {
    expect(script).not.toMatch(/tell application "System Events" to keystroke/);
    expect(script).toContain('throw new Error("systemEventsKey is banned');
    expect(script).toMatch(/async function pidHotkey/);
    expect(script).toMatch(/pressNativeHotkey\(child,\s*"cmd\+o"/);
    expect(script).toMatch(/await pidHotkey\(child!,\s*"cmd\+f"\)/);
  });

  it("prefers tab-title AX activation before Quick Switcher", () => {
    expect(script).toMatch(/async function activateNote\(/);
    expect(script).toMatch(/await activateNote\(child!,\s*fixture\.vault,\s*"Home"/);
    expect(script).toMatch(/await activateNote\(child!,\s*fixture\.vault,\s*"Theme Probe"/);
    expect(script).toMatch(/await activateNote\(child!,\s*fixture\.vault,\s*"Split Right"/);
    expect(script).toMatch(/File: \$\{expectedPath\}/);
    expect(script).toMatch(/Tab \$\{tabTitle\}/);
    expect(script).toMatch(/Search files/);
    expect(script).toMatch(/Close Split Right in native-main/);
  });

  it("scrolls Outline headings frame and uses independent-scroll oracle", () => {
    expect(script).toMatch(/frameNativeNamed\(child,\s*"Outline headings"/);
    expect(script).toMatch(/evaluateIndependentScroll\(/);
    expect(script).toMatch(/scrollNativeWheelAt\(child!,\s*boxes\.right\.wheelX/);
  });

  it("records all 14 feature screenshot ids", () => {
    const ids = [
      "01-tabs-chrome",
      "02-outline-no-frontmatter",
      "03-layout-scroll-radius",
      "04-vault-search-icon",
      "05-vault-search-hotkey",
      "06-find-in-note",
      "07-operation-status",
      "08-workspace-save",
      "09-workspace-restore",
      "10-popout-window",
      "11-popout-rejoin",
      "12-theme-settings",
      "12b-theme-light-applied",
      "13-shortcuts-help",
    ];
    for (const id of ids) {
      expect(script).toContain(`"${id}"`);
    }
  });
  it("AX helper supports cmd+o and AXSearchField text fields", () => {
    expect(ax).toMatch(/"o":\s*CGKeyCode\(kVK_ANSI_O\)/);
    expect(ax).toContain("AXSearchField");
  });
});
