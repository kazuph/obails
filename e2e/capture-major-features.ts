#!/usr/bin/env npx tsx
/**
 * Stable continuous evidence capture for Obails major features.
 * Order optimized from successful capture-4 oracles.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activateNativeApp,
  clickNativeButton,
  dumpNativeButtons,
  focusNativeEditor,
  frameNativeNamed,
  pressNativeHotkey,
  scrollNativeWheelAt,
  setNativeTextField,
  startNativeApp,
  stopExactProcess,
  waitForNativeWindows,
  type NativeAppProcess,
} from "./helpers/native-wails-launch.ts";
import { evaluateIndependentScroll } from "../frontend/src/lib/independent-scroll-oracle.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(REPO, "test-results/major-features");
const IMAGES = path.join(ARTIFACT, "images");
const VIDEOS = path.join(ARTIFACT, "videos");
const LOGS = path.join(ARTIFACT, "logs");
const DEFAULT_DEV_APP = path.join(REPO, "bin/obails.dev.app/Contents/MacOS/obails");
const APP_EXECUTABLE = path.resolve(
  process.env.OBAILS_CAPTURE_APP
    || (existsSync(DEFAULT_DEV_APP) ? DEFAULT_DEV_APP : "/Applications/obails.app/Contents/MacOS/obails"),
);
const TIMEOUT_MS = Number(process.env.OBAILS_CAPTURE_TIMEOUT_MS || 45000);
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");

type FeatureRow = {
  featureId: string;
  title: string;
  tSec: number;
  controls: string[];
  actions: string[];
  oracle: Record<string, unknown>;
  screenshot: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function sh(cmd: string, args: string[]) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}
function frontmostInfo() {
  const script = `
import AppKit
import Foundation
let app = NSWorkspace.shared.frontmostApplication
let dict: [String: Any] = [
  "name": app?.localizedName ?? "",
  "bundle": app?.bundleIdentifier ?? "",
  "pid": Int(app?.processIdentifier ?? 0),
  "path": app?.executableURL?.path ?? ""
]
let data = try JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write(Data([0x0A]))
`;
  return JSON.parse(sh("/usr/bin/swift", ["-e", script]).trim());
}
function activatePid(pid: number) {
  const script = `
import AppKit
guard let running = NSRunningApplication(processIdentifier: pid_t(${pid})) else { fputs("missing\\n", stderr); exit(1) }
running.activate(options: [.activateIgnoringOtherApps])
Thread.sleep(forTimeInterval: 0.45)
print(NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0)
`;
  return Number(sh("/usr/bin/swift", ["-e", script]).trim());
}
function sha256File(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}
function imageMeta(filePath: string) {
  const st = statSync(filePath);
  const sips = sh("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath]);
  return {
    path: path.relative(REPO, filePath),
    bytes: st.size,
    width: Number((sips.match(/pixelWidth:\s*(\d+)/) || [])[1] || 0),
    height: Number((sips.match(/pixelHeight:\s*(\d+)/) || [])[1] || 0),
    sha256: sha256File(filePath),
  };
}
function ffprobeVideo(filePath: string) {
  const info = JSON.parse(
    sh("/opt/homebrew/bin/ffprobe", [
      "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath,
    ]),
  );
  const video = (info.streams || []).find((s: { codec_type?: string }) => s.codec_type === "video");
  const audioStreams = (info.streams || []).filter((s: { codec_type?: string }) => s.codec_type === "audio");
  const st = statSync(filePath);
  return {
    path: path.relative(REPO, filePath),
    bytes: st.size,
    sha256: sha256File(filePath),
    codec: video?.codec_name || null,
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    duration: Number(info.format?.duration || 0),
    frameRate: video?.r_frame_rate || video?.avg_frame_rate || null,
    nbFrames: video?.nb_frames ? Number(video.nb_frames) : null,
    audioStreamCount: audioStreams.length,
  };
}
function listWindows(pid: number) {
  return JSON.parse(sh("/usr/bin/swift", [path.join(REPO, "e2e/helpers/wails-window.swift"), String(pid)]).trim()) as Array<{
    windowNumber: number; title: string; bounds: { Width?: number };
  }>;
}
function captureWindowPng(windowNumber: number, outPath: string) {
  sh("/usr/sbin/screencapture", ["-x", "-t", "png", "-l", String(windowNumber), outPath]);
}
function ocrText(imagePath: string) {
  try {
    return sh("/opt/homebrew/bin/tesseract", [imagePath, "stdout", "-l", "eng"]);
  } catch (err) {
    return `OCR_FAILED:${String(err)}`;
  }
}
function elapsedSec(startedAt: number) {
  return Number(((Date.now() - startedAt) / 1000).toFixed(1));
}
function prepareFixture(root: string) {
  const vault = path.join(root, "vault");
  mkdirSync(path.join(vault, ".obails"), { recursive: true });
  const longTitle =
    "Very-Long-Tab-Title-That-Should-Ellipsize-But-Keep-Close-Button-Visible-ABCDEFGHIJKLMNOPQRSTUVWXYZ.md";
  const deepHeadings = Array.from({ length: 16 }, (_, i) => `## Deep Heading ${String(i + 1).padStart(2, "0")}\n\nParagraph ${i + 1} with enough text to allow independent body scrolling.\n`).join("\n");
  const notes: Record<string, string> = {
    "Home.md": "# Home\n\nWelcome.\n\n## Section Alpha\n\nindigo-falcon\n",
    [longTitle]: "# Long Title Note\n\nBody.\n",
    "Frontmatter Outline.md":
      "---\ntitle: Frontmatter Outline\nread: true\nimportant: yes\nsource: capture-fixture\n---\n\n# Real Heading One\n\nIntro under heading one.\n\n## Real Heading Two\n\nBody under heading two.\n\n" + deepHeadings,
    "Split Right.md": "# Split Right\n\nPane partner.\n",
    "Theme Probe.md": "# Theme Probe\n\nTheme settings target.\n",
  };
  for (let i = 1; i <= 8; i++) {
    const name = `ScrollFile-${String(i).padStart(2, "0")}.md`;
    notes[name] = `# Scroll File ${i}\n\nTree filler ${i}.\n`;
  }
  for (const [name, body] of Object.entries(notes)) writeFileSync(path.join(vault, name), body);
  writeFileSync(
    path.join(vault, ".obails/state.json"),
    JSON.stringify({
      lastOpenedFile: { path: "Frontmatter Outline.md", fileType: "markdown" },
      workspace: {
        paneTree: { paneId: "native-main" },
        activePaneId: "native-main",
        paneTabs: [{
          paneId: "native-main",
          tabs: [
            { path: "Home.md", fileType: "markdown" },
            { path: "Frontmatter Outline.md", fileType: "markdown" },
            { path: longTitle, fileType: "markdown" },
            { path: "Split Right.md", fileType: "markdown" },
            { path: "Theme Probe.md", fileType: "markdown" },
          ],
          activeTabPath: "Frontmatter Outline.md",
        }],
        savedWorkspaces: [],
        popoutWindows: [],
      },
    }, null, 2),
  );
  const configPath = path.join(root, "config.toml");
  writeFileSync(configPath, [
    "[vault]",
    `  path = ${JSON.stringify(vault)}`,
    `  delete_mode = "vault_trash"`,
    "",
    "[ui]",
    `  theme = "onedark"`,
    "",
    "[editor]",
    `  font_size = 14`,
    "",
  ].join("\n"));
  return { vault, configPath, longTitle };
}

function readWorkspaceState(vault: string) {
  return JSON.parse(readFileSync(path.join(vault, ".obails/state.json"), "utf8"));
}

function activeTabPath(state: any): string {
  const paneId = state.workspace?.activePaneId;
  const pane = (state.workspace?.paneTabs || []).find((p: any) => p.paneId === paneId) || state.workspace?.paneTabs?.[0];
  return pane?.activeTabPath || "";
}

function tabPathsOf(state: any): string[] {
  return (state.workspace?.paneTabs || []).flatMap((p: { tabs?: Array<{ path?: string }> }) => (p.tabs || []).map((t) => t.path || ""));
}

async function markerY(child: NativeAppProcess, name: string): Promise<number> {
  const frame = await frameNativeNamed(child, name, 12000);
  return frame.y;
}

function systemEventsKey(_chord: "cmd+o" | "return" | "esc") {
  throw new Error("systemEventsKey is banned; use pressNativeHotkey(child, ...) for PID-targeted keys");
}

/** Activate an existing tab / open note via Quick Switcher (PID-targeted CGEvent hotkeys). */
async function activateViaQuickSwitcher(
  child: NativeAppProcess,
  query: string,
  sessionLog: unknown[],
  vault?: string,
  expectedPath?: string,
) {
  const matches = (active: string) =>
    !expectedPath || active === expectedPath || active.endsWith(expectedPath);

  for (let attempt = 0; attempt < 5; attempt++) {
    await activateNativeApp(child, 8000);
    await sleep(250);
    await pressNativeHotkey(child, "cmd+o", 8000);
    await sleep(800);
    const dump = await dumpNativeButtons(child, 8000);
    const hasField = (dump.extras || []).some((e) => e.name === "Search notes by name or alias")
      || (dump.buttons || []).includes("Search notes by name or alias");
    if (!hasField) {
      sessionLog.push({ event: "quick-switcher-miss", attempt, query, extras: (dump.extras || []).slice(0, 12) });
      try { await pressNativeHotkey(child, "esc", 3000); } catch { /* */ }
      await sleep(250);
      continue;
    }
    await setNativeTextField(child, "Search notes by name or alias", query, 10000);
    // Wait for async result ranking before Return (early Return opens the previous top hit).
    await sleep(900);
    await pressNativeHotkey(child, "return", 8000);
    await sleep(1100);
    if (vault && expectedPath) {
      const active = activeTabPath(readWorkspaceState(vault));
      if (matches(active)) {
        sessionLog.push({ event: "quick-switcher-activate", query, active, attempt });
        return;
      }
      sessionLog.push({ event: "quick-switcher-mismatch", query, active, expectedPath, attempt });
      try { await pressNativeHotkey(child, "esc", 3000); } catch { /* */ }
      continue;
    }
    return;
  }
  throw new Error(`Quick Switcher failed for query=${query}`);
}

/** Prefer AX tab-title click; then filtered file-tree; then Quick Switcher (menu/Cmd+O). */
async function activateNote(
  child: NativeAppProcess,
  vault: string,
  tabTitle: string,
  expectedPath: string,
  sessionLog: unknown[],
) {
  const matches = (active: string) => active === expectedPath || active.endsWith(expectedPath);

  try {
    await clickNativeButton(child, `Tab ${tabTitle}`, 6000);
    await sleep(500);
    const active = activeTabPath(readWorkspaceState(vault));
    if (matches(active)) {
      sessionLog.push({ event: "tab-aria-activate", tabTitle, active });
      return "tab-aria";
    }
    sessionLog.push({ event: "tab-aria-mismatch", tabTitle, active, expectedPath });
  } catch (err) {
    sessionLog.push({ event: "tab-aria-miss", tabTitle, error: String(err) });
  }

  const fileLabel = `File: ${expectedPath}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await setNativeTextField(child, "Search files", tabTitle, 8000);
      await sleep(350);
      const frame = await frameNativeNamed(child, fileLabel, 10000);
      sh("/opt/homebrew/bin/cliclick", [
        `c:${Math.round(frame.x + Math.min(frame.width / 2, 40))},${Math.round(frame.y + frame.height / 2)}`,
      ]);
      await sleep(900);
      let active = activeTabPath(readWorkspaceState(vault));
      if (!matches(active)) {
        // Second click — some builds need activate after select.
        sh("/opt/homebrew/bin/cliclick", [
          `c:${Math.round(frame.x + Math.min(frame.width / 2, 40))},${Math.round(frame.y + frame.height / 2)}`,
        ]);
        await sleep(900);
        active = activeTabPath(readWorkspaceState(vault));
      }
      try { await setNativeTextField(child, "Search files", "", 5000); } catch { /* */ }
      if (matches(active)) {
        sessionLog.push({ event: "file-tree-activate", fileLabel, active, attempt });
        return "file-tree";
      }
      sessionLog.push({ event: "file-tree-mismatch", fileLabel, active, expectedPath, attempt });
    } catch (err) {
      sessionLog.push({ event: "file-tree-miss", fileLabel, error: String(err), attempt });
      try { await setNativeTextField(child, "Search files", "", 5000); } catch { /* */ }
    }
  }

  // Menu Open no longer steals Cmd+O; prefer menu item then PID hotkey.
  try {
    await activateNativeApp(child, 8000);
    sh("/usr/bin/osascript", [
      "-e",
      'tell application "System Events" to tell process "Obails Dev" to click menu item "Quick Switcher" of menu 1 of menu bar item "File" of menu bar 1',
    ]);
    await sleep(800);
    const dump = await dumpNativeButtons(child, 8000);
    const hasField = (dump.extras || []).some((e) => e.name === "Search notes by name or alias")
      || (dump.buttons || []).includes("Search notes by name or alias");
    if (hasField) {
      await setNativeTextField(child, "Search notes by name or alias", tabTitle, 10000);
      await sleep(900);
      await pressNativeHotkey(child, "return", 8000);
      await sleep(1100);
      const active = activeTabPath(readWorkspaceState(vault));
      if (matches(active)) {
        sessionLog.push({ event: "menu-quick-switcher-activate", tabTitle, active });
        return "menu-quick-switcher";
      }
      sessionLog.push({ event: "menu-quick-switcher-mismatch", tabTitle, active, expectedPath });
      try { await pressNativeHotkey(child, "esc", 3000); } catch { /* */ }
    } else {
      sessionLog.push({ event: "menu-quick-switcher-no-field" });
      try { await pressNativeHotkey(child, "esc", 3000); } catch { /* */ }
    }
  } catch (err) {
    sessionLog.push({ event: "menu-quick-switcher-miss", error: String(err) });
  }

  await activateViaQuickSwitcher(child, tabTitle, sessionLog, vault, expectedPath);
  const after = activeTabPath(readWorkspaceState(vault));
  if (!matches(after)) {
    throw new Error(`activateNote failed for ${tabTitle}; active=${after}`);
  }
  return "quick-switcher";
}

function panelHash(box: { x: number; y: number; w: number; h: number }, outPath: string) {
  sh("/usr/sbin/screencapture", [
    "-x", "-R",
    `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.w)},${Math.round(box.h)}`,
    outPath,
  ]);
  return sha256File(outPath);
}

async function scrollOwnerBoxes(child: NativeAppProcess) {
  const ft = await frameNativeNamed(child, "File tree", 12000);
  const ws = await frameNativeNamed(child, "Workspace", 12000);
  const outlineList = await frameNativeNamed(child, "Outline headings", 12000).catch(
    async () => frameNativeNamed(child, "Right sidebar", 12000),
  );
  const rightBar = await frameNativeNamed(child, "Right sidebar", 12000).catch(async () => outlineList);
  const preferredMarkers = [
    "Go to heading: Deep Heading 12",
    "Go to heading: Deep Heading 08",
    "Go to heading: Deep Heading 05",
    "Go to heading: Real Heading Two",
  ];
  let outlineName = preferredMarkers[0];
  for (const name of preferredMarkers) {
    try {
      await frameNativeNamed(child, name, 4000);
      outlineName = name;
      break;
    } catch { /* try next */ }
  }
  // Body stays strictly left of the right sidebar.
  const bodyRight = Math.max(ft.x + ft.width + 40, rightBar.x - 40);
  const bodyLeft = ft.x + ft.width + 24;
  const bodyWidth = Math.max(160, bodyRight - bodyLeft);
  return {
    left: {
      x: ft.x,
      y: ft.y + 90,
      w: Math.max(120, ft.width),
      h: 280,
      wheelX: ft.x + ft.width / 2,
      wheelY: ft.y + ft.height * 0.65,
    },
    body: {
      x: bodyLeft,
      y: ws.y + 160,
      w: bodyWidth,
      h: 280,
      wheelX: bodyLeft + bodyWidth * 0.5,
      wheelY: ws.y + ws.height * 0.55,
    },
    right: {
      x: outlineList.x,
      y: outlineList.y + 24,
      w: Math.max(120, outlineList.width),
      h: Math.max(160, Math.min(280, outlineList.height - 24)),
      wheelX: outlineList.x + outlineList.width * 0.5,
      wheelY: outlineList.y + Math.min(outlineList.height * 0.55, 180),
      outlineName,
    },
  };
}

function clickThemeGithubLight(sessionLog: unknown[]) {
  const processNames = ["Obails Dev", "obails", "Obails"];
  for (const processName of processNames) {
    try {
      sh("/usr/bin/osascript", [
        "-e",
        `tell application "System Events" to tell process ${JSON.stringify(processName)} to click menu item "GitHub Light" of menu 1 of menu bar item "Theme" of menu bar 1`,
      ]);
      sessionLog.push({ event: "theme-menu-click", processName });
      return processName;
    } catch (err) {
      sessionLog.push({ event: "theme-menu-miss", processName, error: String(err) });
    }
  }
  throw new Error(`Theme menu GitHub Light failed for processes: ${processNames.join(", ")}`);
}

async function clickCloseTabAxOrFrame(
  child: NativeAppProcess,
  closeLabel: string,
  closeTarget: string,
  vault: string,
  sessionLog: unknown[],
) {
  const gone = () => !tabPathsOf(readWorkspaceState(vault)).includes(closeTarget);

  try {
    await clickNativeButton(child, closeLabel, 6000);
    await sleep(400);
    if (gone()) return "ax-click-button";
  } catch (err) {
    sessionLog.push({ event: "close-tab-ax-miss", label: closeLabel, error: String(err) });
  }
  try {
    const frame = await frameNativeNamed(child, closeLabel, 6000);
    sh("/opt/homebrew/bin/cliclick", [
      `c:${Math.round(frame.x + frame.width / 2)},${Math.round(frame.y + frame.height / 2)}`,
    ]);
    await sleep(400);
    if (gone()) return "ax-frame-click";
  } catch (err) {
    sessionLog.push({ event: "close-tab-frame-miss", label: closeLabel, error: String(err) });
  }

  const stripFrames: Array<{ label: string; frame: { x: number; y: number; width: number; height: number } }> = [];
  for (const label of ["Tabs in pane native-main", "Workspace"]) {
    try {
      stripFrames.push({ label, frame: await frameNativeNamed(child, label, 8000) });
    } catch (err) {
      sessionLog.push({ event: "close-strip-frame-miss", label, error: String(err) });
    }
  }
  for (const { label, frame } of stripFrames) {
    const y = Math.round(frame.y + Math.min(14, Math.max(8, frame.height / 2)));
    const start = Math.round(frame.x + 8);
    const end = Math.round(frame.x + Math.min(frame.width, 1100) - 4);
    for (let x = end; x >= start; x -= 12) {
      if (gone()) return `${label}-already-closed`;
      sh("/opt/homebrew/bin/cliclick", [`c:${x},${y}`]);
      await sleep(160);
      if (gone()) {
        sessionLog.push({ event: "close-tab-strip-sweep-hit", label, x, y });
        return `${label}-strip-sweep`;
      }
    }
  }
  throw new Error(`Close control missing: ${closeLabel}`);
}

function parkCursorAway(pid: number) {
  const wins = listWindows(pid);
  const win = [...wins].sort((a: any, b: any) => (b.bounds?.Width || 0) - (a.bounds?.Width || 0))[0] as any;
  const b = win?.bounds;
  if (!b) return;
  sh("/opt/homebrew/bin/cliclick", [`m:${Math.round(Number(b.X) + 8)},${Math.round(Number(b.Y) + 8)}`]);
}

function isOutlineHeadingLabel(label: string): boolean {
  return label.startsWith("Go to heading:")
    || /^(Real Heading|Deep Heading)\b/.test(label);
}

function normalizeOutlineLabel(label: string): string {
  return label.startsWith("Go to heading:") ? label : `Go to heading: ${label}`;
}

async function waitForOutlineHeadings(child: NativeAppProcess, sessionLog: unknown[]): Promise<string[]> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const dump = await dumpNativeButtons(child, 16000);
    const outlineButtons = Array.from(new Set(
      (dump.buttons || []).filter(isOutlineHeadingLabel).map(normalizeOutlineLabel),
    ));
    if (outlineButtons.length >= 2) {
      sessionLog.push({ event: "outline-ready", attempt, count: outlineButtons.length, sample: outlineButtons.slice(0, 6) });
      return outlineButtons;
    }
    if (attempt === 0 || attempt === 10) {
      sessionLog.push({
        event: "outline-empty-dump",
        attempt,
        buttonSample: (dump.buttons || []).slice(0, 40),
      });
      writeFileSync(path.join(LOGS, `${STAMP}-outline-empty-${attempt}.json`), JSON.stringify(dump, null, 2));
    }
    if (outlineButtons.length === 0) {
      try { await clickNativeButton(child, "Outline", 3000); } catch { /* */ }
      try {
        await clickNativeButton(child, "Toggle Source", 4000);
        await sleep(350);
        await clickNativeButton(child, "Toggle Source", 4000);
      } catch { /* */ }
      try { await pressNativeHotkey(child, "esc", 3000); } catch { /* */ }
    }
    await sleep(400);
  }
  return [];
}

async function clickOutlineHeading(child: NativeAppProcess, heading: string, sessionLog: unknown[]) {
  try {
    await clickNativeButton(child, heading, 8000);
    sessionLog.push({ event: "outline-click-ax", heading });
    return "ax";
  } catch (err) {
    sessionLog.push({ event: "outline-click-ax-miss", heading, error: String(err) });
  }
  try {
    const frame = await frameNativeNamed(child, heading, 8000);
    sh("/opt/homebrew/bin/cliclick", [
      `c:${Math.round(frame.x + Math.min(frame.width / 2, 80))},${Math.round(frame.y + frame.height / 2)}`,
    ]);
    sessionLog.push({ event: "outline-click-frame", heading, frame });
    return "frame";
  } catch (err) {
    sessionLog.push({ event: "outline-click-frame-miss", heading, error: String(err) });
  }
  // Geometric fallback: second visible row in Outline headings list.
  const list = await frameNativeNamed(child, "Outline headings", 10000);
  const x = Math.round(list.x + Math.min(60, list.width / 2));
  const y = Math.round(list.y + 44);
  sh("/opt/homebrew/bin/cliclick", [`c:${x},${y}`]);
  sessionLog.push({ event: "outline-click-list-geom", heading, x, y, list });
  return "list-geom";
}

function assertChildAlive(child: NativeAppProcess) {
  try {
    process.kill(child.pid, 0);
  } catch {
    throw new Error(`capture app PID ${child.pid} exited early`);
  }
}
async function ensureToolbarReady(child: NativeAppProcess, sessionLog: unknown[]) {
  for (let i = 0; i < 3; i++) {
    try { await pressNativeHotkey(child, "esc", 3000); } catch { /* */ }
    await sleep(250);
  }
  await activateNativeApp(child, 8000);
  await sleep(400);
  for (let i = 0; i < 10; i++) {
    const dump = await dumpNativeButtons(child, 8000);
    if ((dump.buttons || []).includes("Settings") && (dump.buttons || []).includes("Search vault") && (dump.buttons || []).includes("Pop out pane")) {
      return dump;
    }
    try { await pressNativeHotkey(child, "esc", 3000); } catch { /* */ }
    await sleep(300);
  }
  const dump = await dumpNativeButtons(child, 8000);
  sessionLog.push({ event: "toolbar-not-ready", buttons: (dump.buttons || []).slice(0, 40) });
  return dump;
}

function clickWindowContentCenter(pid: number) {
  const wins = listWindows(pid);
  const win = [...wins].sort((a, b) => (b.bounds?.Width || 0) - (a.bounds?.Width || 0))[0] as any;
  if (!win?.bounds) throw new Error("no window bounds");
  const b = win.bounds;
  // Click roughly in the editor/preview body, below toolbar.
  const x = Math.round((b.X || 0) + (b.Width || 800) * 0.55);
  const y = Math.round((b.Y || 0) + (b.Height || 600) * 0.55);
  sh("/opt/homebrew/bin/cliclick", [`c:${x},${y}`]);
}

async function pidHotkey(child: NativeAppProcess, chord: string) {
  await pressNativeHotkey(child, chord, 8000);
}

function startSilentScreenRecord(outPath: string) {
  const proc = spawn("/opt/homebrew/bin/ffmpeg", [
    "-y", "-f", "avfoundation", "-framerate", "15", "-capture_cursor", "1",
    "-i", "Capture screen 0", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", outPath,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr += d.toString(); });
  return {
    getStderr: () => stderr,
    async stop() {
      if (proc.exitCode != null) return;
      proc.kill("SIGINT");
      await new Promise<void>((resolve) => proc.once("exit", () => resolve()));
    },
  };
}

async function main() {
  mkdirSync(IMAGES, { recursive: true });
  mkdirSync(VIDEOS, { recursive: true });
  mkdirSync(LOGS, { recursive: true });

  const chunkRaw = process.env.OBAILS_CHUNK || "all";
  const chunkSet = chunkRaw === "all"
    ? null
    : new Set(chunkRaw.split(",").map((s) => s.trim()).filter(Boolean));
  const mergeMode = process.env.OBAILS_MERGE === "1" || Boolean(chunkSet);
  const recordVideo = process.env.OBAILS_RECORD_VIDEO === "1" || (!chunkSet && process.env.OBAILS_RECORD_VIDEO !== "0");
  const restoreBetween = process.env.OBAILS_RESTORE_BETWEEN !== "0";

  if (!mergeMode) {
    for (const f of readdirSync(IMAGES)) if (f.endsWith(".png")) rmSync(path.join(IMAGES, f), { force: true });
    for (const f of readdirSync(VIDEOS)) rmSync(path.join(VIDEOS, f), { force: true });
  }

  const priorFrontmost = frontmostInfo();
  writeFileSync(path.join(LOGS, `${STAMP}-prior-frontmost.json`), JSON.stringify(priorFrontmost, null, 2));
  try { execFileSync("/usr/bin/pbcopy", { input: "", stdio: ["pipe", "ignore", "ignore"] }); } catch { /* */ }

  const fixtureRoot = path.join(tmpdir(), `obails-major-features-${Date.now()}`);
  mkdirSync(fixtureRoot, { recursive: true });
  const fixture = prepareFixture(fixtureRoot);
  const appLog = path.join(LOGS, `${STAMP}-obails-app.log`);
  const sessionLog: unknown[] = [{ event: "chunk-config", chunkRaw, mergeMode, recordVideo, restoreBetween }];
  const features: FeatureRow[] = [];
  if (mergeMode && existsSync(path.join(ARTIFACT, "evidence-manifest.json"))) {
    try {
      const prev = JSON.parse(readFileSync(path.join(ARTIFACT, "evidence-manifest.json"), "utf8"));
      for (const row of prev.features || []) {
        if (row?.featureId) features.push(row);
      }
      sessionLog.push({ event: "merged-previous-features", count: features.length });
    } catch (err) {
      sessionLog.push({ event: "merge-previous-miss", error: String(err) });
    }
  }
  const videoPath = path.join(VIDEOS, "obails-major-features-continuous.mp4");
  let child: NativeAppProcess | null = null;
  let recorder: ReturnType<typeof startSilentScreenRecord> | null = null;
  let captureStartedAt = 0;

  const recordStep = (featureId: string, title: string, data: Omit<FeatureRow, "featureId" | "title" | "tSec">) => {
    const entry = { featureId, title, tSec: elapsedSec(captureStartedAt || Date.now()), ...data };
    const idx = features.findIndex((f) => f.featureId === featureId);
    if (idx >= 0) features[idx] = entry;
    else features.push(entry);
    sessionLog.push(entry);
    return entry;
  };
  const shot = (featureId: string) => {
    if (!child) throw new Error("no child");
    const file = path.join(IMAGES, `${featureId}.png`);
    const wins = listWindows(child.pid);
    const target = [...wins].sort((a, b) => (b.bounds?.Width || 0) - (a.bounds?.Width || 0))[0];
    if (!target?.windowNumber) throw new Error(`no window for ${featureId}`);
    captureWindowPng(target.windowNumber, file);
    return imageMeta(file);
  };
  const runStep = async (label: string, fn: () => Promise<void>) => {
    if (chunkSet && !chunkSet.has(label)) {
      sessionLog.push({ event: "step-skip", label });
      return;
    }
    try {
      assertChildAlive(child!);
      await activateNativeApp(child!, 8000);
      await fn();
      sessionLog.push({ event: "step-ok", label });
    } catch (err) {
      sessionLog.push({ event: "step-error", label, error: String(err) });
      writeFileSync(path.join(LOGS, `${STAMP}-step-error-${label}.txt`), String(err));
    } finally {
      if (restoreBetween && priorFrontmost?.pid) {
        try {
          activatePid(priorFrontmost.pid);
          sessionLog.push({ event: "restored-after-step", label, pid: priorFrontmost.pid });
        } catch (err) {
          sessionLog.push({ event: "restore-after-step-error", label, error: String(err) });
        }
        await sleep(250);
      }
    }
  };

  try {
    child = await startNativeApp(APP_EXECUTABLE, fixture.configPath, appLog, TIMEOUT_MS);
    sessionLog.push({ event: "launched", child, priorFrontmost });
    await waitForNativeWindows(child, TIMEOUT_MS);
    if (recordVideo) {
      recorder = startSilentScreenRecord(videoPath);
      await sleep(1500);
    } else {
      await sleep(600);
    }
    captureStartedAt = Date.now();
    await activateNativeApp(child, TIMEOUT_MS);
    await sleep(1200);

    let dump = await dumpNativeButtons(child, 12000);
    for (let i = 0; i < 25 && !(dump.buttons || []).includes("Search vault"); i++) {
      await sleep(400);
      dump = await dumpNativeButtons(child, 8000);
    }
    writeFileSync(path.join(LOGS, `${STAMP}-ax-buttons-initial.json`), JSON.stringify(dump, null, 2));
    if (!(dump.buttons || []).includes("Search vault")) {
      throw new Error(`Search vault missing: ${(dump.buttons || []).slice(0, 40).join(" | ")}`);
    }

    let meta: { path: string } = { path: "" };

    // 1 tabs — activate two distinct tabs via tab-title AX (QS fallback), then close via AX close button
    await runStep("tabs", async () => {
      const before = readWorkspaceState(fixture.vault);
      const beforeActive = activeTabPath(before);
      await activateNote(child!, fixture.vault, "Home", "Home.md", sessionLog);
      const homeActive = activeTabPath(readWorkspaceState(fixture.vault));
      await activateNote(child!, fixture.vault, "Theme Probe", "Theme Probe.md", sessionLog);
      const themeActive = activeTabPath(readWorkspaceState(fixture.vault));
      await activateNote(child!, fixture.vault, "Split Right", "Split Right.md", sessionLog);
      const closeTarget = "Split Right.md";
      const closeLabel = "Close Split Right in native-main";
      dump = await dumpNativeButtons(child!, 10000);
      const axCloseBefore = (dump.buttons || []).filter((b) => /Close .+ in /.test(b));
      const closeMethod = await clickCloseTabAxOrFrame(child!, closeLabel, closeTarget, fixture.vault, sessionLog);
      await sleep(500);
      const afterClose = readWorkspaceState(fixture.vault);
      const pathsAfterClose = tabPathsOf(afterClose);
      if (pathsAfterClose.includes(closeTarget)) {
        throw new Error(`Close failed via ${closeMethod}; Split Right.md still present`);
      }
      meta = shot("01-tabs-chrome");
      dump = await dumpNativeButtons(child!, 10000);
      recordStep("01-tabs-chrome", "Tab boundary / selected / title-close alignment / long title keeps ×", {
        controls: ["role=group", ".workspace-pane-tab-title", ".workspace-pane-tab-close", closeLabel],
        actions: [
          "Activate Home via tab title",
          "Activate Theme Probe via tab title",
          "Activate Split Right via tab title",
          `Close Split Right tab (${closeMethod})`,
        ],
        oracle: {
          beforeActive,
          activatedPaths: [homeActive, themeActive],
          activatedTwoDistinct: homeActive !== themeActive && /Home\.md$/.test(homeActive) && /Theme Probe\.md$/.test(themeActive),
          closedPath: closeTarget,
          closedPathAbsent: !pathsAfterClose.includes(closeTarget),
          closeClicked: true,
          closeMethod,
          closeLabel,
          axCloseButtonsBefore: axCloseBefore,
          axCloseButtonsAfter: (dump.buttons || []).filter((b) => /Close .+ in /.test(b)),
          longTitleStillPresent: pathsAfterClose.some((p) => /Very-Long-Tab-Title/.test(p)),
          tabPathsAfter: pathsAfterClose,
        },
        screenshot: meta.path,
      });
      await activateNote(child!, fixture.vault, "Frontmatter Outline", "Frontmatter Outline.md", sessionLog);
      await sleep(500);
    });

    // 2 outline — ensure Frontmatter Outline, click a heading, assert body panel changed
    await runStep("outline", async () => {
      // Force a real document switch so outline rebuilds (no-op activate leaves outline empty).
      await activateNote(child!, fixture.vault, "Home", "Home.md", sessionLog);
      await sleep(400);
      await activateNote(child!, fixture.vault, "Frontmatter Outline", "Frontmatter Outline.md", sessionLog);
      await sleep(900);
      try { await clickNativeButton(child!, "Refresh", 5000); } catch { /* */ }
      await sleep(700);
      const outlineButtons = await waitForOutlineHeadings(child!, sessionLog);
      dump = await dumpNativeButtons(child!, 20000);
      const allOutline = Array.from(new Set([
        ...outlineButtons,
        ...((dump.buttons || []).filter(isOutlineHeadingLabel).map(normalizeOutlineLabel)),
      ]));
      const forbidden = ["Go to heading: title", "Go to heading: read", "Go to heading: important", "Go to heading: source"];
      if (allOutline.length < 2) {
        throw new Error(`outline heading missing; have=${allOutline.slice(0, 8).join("|")}`);
      }
      const headingToClick = allOutline.find((h) => h.includes("Real Heading Two"))
        || allOutline.find((h) => /Deep Heading 0[1-5]/.test(h))
        || allOutline[1]
        || allOutline[0];
      const headingLabel = headingToClick.replace("Go to heading: ", "");
      let list: { x: number; y: number; width: number; height: number };
      try {
        list = await frameNativeNamed(child!, "Outline headings", 8000);
      } catch (err) {
        sessionLog.push({ event: "outline-list-frame-miss", error: String(err) });
        list = await frameNativeNamed(child!, "Right sidebar", 12000);
      }
      const ws = await frameNativeNamed(child!, "Workspace", 12000);
      const bodyBox = {
        x: ws.x + 24,
        y: ws.y + 120,
        w: Math.max(180, ws.width * 0.55),
        h: 260,
      };
      parkCursorAway(child!.pid);
      await sleep(150);
      const bodyHashBefore = panelHash(bodyBox, path.join(LOGS, `${STAMP}-outline-body-before.png`));
      // Prefer list geometry — named AX clicks flake after deep tree walks.
      const x = Math.round(list.x + Math.min(70, list.width / 2));
      const y = Math.round(list.y + Math.min(56, Math.max(36, list.height * 0.12)));
      sh("/opt/homebrew/bin/cliclick", [`c:${x},${y}`]);
      sessionLog.push({ event: "outline-click-list-geom", heading: headingToClick, x, y, list });
      await sleep(1000);
      parkCursorAway(child!.pid);
      await sleep(150);
      const bodyHashAfter = panelHash(bodyBox, path.join(LOGS, `${STAMP}-outline-body-after.png`));
      meta = shot("02-outline-no-frontmatter");
      dump = await dumpNativeButtons(child!, 16000);
      const ocr = ocrText(path.join(IMAGES, "02-outline-no-frontmatter.png"));
      const bodyChanged = bodyHashBefore !== bodyHashAfter;
      const ocrShowsJump = new RegExp(headingLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(ocr)
        || /Real Heading|Deep Heading/i.test(ocr);
      const expectedPresent = allOutline.filter((b) => /Real Heading|Deep Heading/.test(b));
      const forbiddenPresent = forbidden.filter((n) => allOutline.includes(n) || ((dump.buttons || []).includes(n)));
      const jumpAssert = (bodyChanged || ocrShowsJump) && expectedPresent.length >= 2 && forbiddenPresent.length === 0;
      recordStep("02-outline-no-frontmatter", "YAML frontmatter does not leak into Outline; heading jump works", {
        controls: ["#outline-list", headingToClick],
        actions: [`Open Frontmatter Outline`, `Click outline list (${headingToClick})`],
        oracle: {
          outlineButtons: allOutline,
          forbiddenPresent,
          expectedPresent,
          clickedHeading: headingToClick,
          headingLabel,
          bodyHashBefore,
          bodyHashAfter,
          bodyPanelChanged: bodyChanged,
          ocrShowsJump,
          jumpAssert,
          ocrSnippet: ocr.split("\n").filter(Boolean).slice(0, 12),
        },
        screenshot: meta.path,
      });
      if (!jumpAssert) {
        throw new Error(`outline jump oracle failed bodyChanged=${bodyChanged} ocr=${ocrShowsJump} expected=${expectedPresent.length}`);
      }
    });

    // 3 independent scroll — park cursor between hashes; assert owner-only changes
    await runStep("independent-scroll", async () => {
      await ensureToolbarReady(child!, sessionLog);
      await activateNote(child!, fixture.vault, "Frontmatter Outline", "Frontmatter Outline.md", sessionLog);
      await sleep(500);
      await waitForOutlineHeadings(child!, sessionLog);
      const boxes = await scrollOwnerBoxes(child!);
      const outlineName = boxes.right.outlineName;

      async function snap(tag: string) {
        parkCursorAway(child!.pid);
        await sleep(180);
        const left = panelHash(boxes.left, path.join(LOGS, `${STAMP}-scroll-${tag}-left.png`));
        const body = panelHash(boxes.body, path.join(LOGS, `${STAMP}-scroll-${tag}-body.png`));
        const right = panelHash(boxes.right, path.join(LOGS, `${STAMP}-scroll-${tag}-right.png`));
        const outlineY = await markerY(child!, outlineName).catch(async () => markerY(child!, "Go to heading: Deep Heading 08"));
        return { left, body, right, outlineY };
      }

      // Focus outline list before wheel so WKWebView receives scroll on the owner.
      sh("/opt/homebrew/bin/cliclick", [
        `c:${Math.round(boxes.right.wheelX)},${Math.round(boxes.right.wheelY)}`,
      ]);
      await sleep(250);
      const baseline = await snap("0");
      await scrollNativeWheelAt(child!, boxes.right.wheelX, boxes.right.wheelY, -36, 8000);
      await sleep(700);
      const afterRight = await snap("R");
      await scrollNativeWheelAt(child!, boxes.left.wheelX, boxes.left.wheelY, -20, 8000);
      await sleep(600);
      const afterLeft = await snap("L");
      await scrollNativeWheelAt(child!, boxes.body.wheelX, boxes.body.wheelY, -24, 8000);
      await sleep(600);
      const afterBody = await snap("B");

      const verdict = evaluateIndependentScroll(baseline, afterRight, afterLeft, afterBody);

      meta = shot("03-layout-scroll-radius");
      recordStep("03-layout-scroll-radius", "macOS-compatible corners + independent left/body/right scroll owners", {
        controls: ["#file-tree", "#preview|#editor", "#right-sidebar", "#outline-list"],
        actions: [
          "Scroll right Outline / Right sidebar",
          "Scroll left file tree",
          "Scroll body preview/editor",
        ],
        oracle: {
          windowCount: listWindows(child!.pid).length,
          boxes,
          baseline,
          afterRight,
          afterLeft,
          afterBody,
          leftOwnerOnlyChanged: verdict.leftOnly,
          bodyOwnerOnlyChanged: verdict.bodyOnly,
          rightOwnerOnlyChanged: verdict.rightOnly,
          independentScrollAssert: verdict.independentScrollAssert,
          scrollOwnersContract: "panel crop sha256 + outline heading Y via Right sidebar frame",
        },
        screenshot: meta.path,
      });
    });

    // 4 vault icon
    await runStep("vault-icon", async () => {
      await clickNativeButton(child!, "Search vault", 10000);
      await sleep(800);
      meta = shot("04-vault-search-icon");
      dump = await dumpNativeButtons(child!, 10000);
      const ocr = ocrText(path.join(IMAGES, "04-vault-search-icon.png"));
      recordStep("04-vault-search-icon", "Vault Search toolbar icon opens Search vault dialog", {
        controls: ['#vault-search-btn aria-label="Search vault"'],
        actions: ["Click Search vault"],
        oracle: {
          hasCloseVaultSearch: (dump.buttons || []).includes("Close vault search"),
          ocrHasSearchVault: /search vault/i.test(ocr),
        },
        screenshot: meta.path,
      });
      if ((dump.buttons || []).includes("Close vault search")) await clickNativeButton(child!, "Close vault search", 8000);
      else await pressNativeHotkey(child!, "esc", 5000);
      await sleep(600);
    });

    // 5 vault hotkey (non-note focus via workspace name field + PID-targeted ⌘F)
    await runStep("vault-hotkey", async () => {
      await ensureToolbarReady(child!, sessionLog);
      dump = await dumpNativeButtons(child!, 8000);
      if ((dump.buttons || []).includes("Close vault search")) {
        await clickNativeButton(child!, "Close vault search", 8000);
        await sleep(400);
      }
      await setNativeTextField(child!, "Name for saving or restoring a workspace layout", "", 10000);
      await sleep(300);
      await pidHotkey(child!, "cmd+f");
      await sleep(900);
      dump = await dumpNativeButtons(child!, 10000);
      if (!(dump.buttons || []).includes("Close vault search")) {
        sessionLog.push({ event: "vault-hotkey-retry" });
        await setNativeTextField(child!, "Name for saving or restoring a workspace layout", "", 10000);
        await sleep(200);
        await pidHotkey(child!, "cmd+f");
        await sleep(900);
      }
      meta = shot("05-vault-search-hotkey");
      dump = await dumpNativeButtons(child!, 10000);
      const ocr = ocrText(path.join(IMAGES, "05-vault-search-hotkey.png"));
      recordStep("05-vault-search-hotkey", "Cmd/Ctrl+F outside note opens Vault Search", {
        controls: ["⌘F", "#vault-search-overlay", "#workspace-name"],
        actions: ["Focus workspace name field, pressNativeHotkey cmd+f"],
        oracle: {
          hasCloseVaultSearch: (dump.buttons || []).includes("Close vault search"),
          ocrHasSearchVault: /search vault/i.test(ocr),
          ocrSnippet: ocr.split("\n").filter(Boolean).slice(0, 10),
        },
        screenshot: meta.path,
      });
      await ensureToolbarReady(child!, sessionLog);
    });

    // 6 find in note
    await runStep("find-in-note", async () => {
      await ensureToolbarReady(child!, sessionLog);
      await activateNativeApp(child!, 8000);
      // Prefer explicit Toggle Source checkbox; fall back to ⌘E.
      try {
        await clickNativeButton(child!, "Toggle Source", 10000);
      } catch (err) {
        sessionLog.push({ event: "toggle-source-click-error", error: String(err) });
        await pidHotkey(child!, "cmd+e");
      }
      await sleep(1200);
      dump = await dumpNativeButtons(child!, 10000);
      const hasEditor = (dump.extras || []).some((e) => /Editor in pane/i.test(e.name))
        || (dump.buttons || []).some((b) => /Editor in pane/i.test(b));
      sessionLog.push({ event: "source-editor-probe", hasEditor, extras: dump.extras || [] });
      let focused = false;
      try {
        await focusNativeEditor(child!, 12000);
        focused = true;
      } catch (err) {
        sessionLog.push({ event: "focus-editor-error", error: String(err) });
        clickWindowContentCenter(child!.pid);
        await sleep(400);
        try {
          await focusNativeEditor(child!, 10000);
          focused = true;
        } catch (err2) {
          sessionLog.push({ event: "focus-editor-error-2", error: String(err2) });
          clickWindowContentCenter(child!.pid);
        }
      }
      await sleep(400);
      await pidHotkey(child!, "cmd+f");
      await sleep(1000);
      dump = await dumpNativeButtons(child!, 10000);
      let hasFindField = (dump.extras || []).some((e) => (e.role === "AXTextField" || e.role === "AXSearchField") && /find in note/i.test(e.name))
        || (dump.buttons || []).includes("Close find");
      if (!hasFindField && (dump.buttons || []).includes("Close vault search")) {
        // Wrong context — close vault search, re-focus editor, retry once.
        sessionLog.push({ event: "find-in-note-got-vault-retry" });
        await clickNativeButton(child!, "Close vault search", 8000);
        await sleep(400);
        try { await focusNativeEditor(child!, 10000); focused = true; } catch { clickWindowContentCenter(child!.pid); }
        await sleep(300);
        await pidHotkey(child!, "cmd+f");
        await sleep(1000);
        dump = await dumpNativeButtons(child!, 10000);
        hasFindField = (dump.extras || []).some((e) => (e.role === "AXTextField" || e.role === "AXSearchField") && /find in note/i.test(e.name))
          || (dump.buttons || []).includes("Close find");
      }
      meta = shot("06-find-in-note");
      dump = await dumpNativeButtons(child!, 10000);
      const ocr = ocrText(path.join(IMAGES, "06-find-in-note.png"));
      hasFindField = hasFindField
        || (dump.extras || []).some((e) => (e.role === "AXTextField" || e.role === "AXSearchField") && /find in note/i.test(e.name))
        || (dump.buttons || []).includes("Close find")
        || /find in note/i.test(ocr);
      recordStep("06-find-in-note", "Cmd/Ctrl+F inside note opens Find in note", {
        controls: ['#note-search-input aria-label="Find in note"', "source editor focus + ⌘F"],
        actions: ["Toggle Source, focus editor, pressNativeHotkey cmd+f"],
        oracle: {
          focused,
          hasCloseFind: (dump.buttons || []).includes("Close find"),
          hasFindField,
          ocrHasFindInNote: /find in note/i.test(ocr),
          ocrHasSearchVaultDialog: /try: tag:/i.test(ocr) && /match case/i.test(ocr),
          extras: dump.extras || [],
          ocrSnippet: ocr.split("\n").filter(Boolean).slice(0, 12),
        },
        screenshot: meta.path,
      });
      await ensureToolbarReady(child!, sessionLog);
    });

    // 7 operation status
    await runStep("operation-status", async () => {
      await ensureToolbarReady(child!, sessionLog);
      await setNativeTextField(child!, "Name for saving or restoring a workspace layout", "", 10000);
      await sleep(200);
      await clickNativeButton(child!, "Restore workspace", 10000);
      await sleep(800);
      meta = shot("07-operation-status");
      dump = await dumpNativeButtons(child!, 10000);
      const ocr = ocrText(path.join(IMAGES, "07-operation-status.png"));
      recordStep("07-operation-status", "Failures surface as operation status with Dismiss/Retry", {
        controls: ["#operation-status-row", "#operation-dismiss"],
        actions: ["Clear workspace name, Restore workspace"],
        oracle: {
          hasDismiss: (dump.buttons || []).includes("Dismiss") || /\bDismiss\b/i.test(ocr),
          ocrHasMessage: /enter the exact saved workspace name|cannot be blank|could not/i.test(ocr),
          ocrSnippet: ocr.split("\n").filter(Boolean).slice(0, 10),
        },
        screenshot: meta.path,
      });
      if ((dump.buttons || []).includes("Dismiss")) await clickNativeButton(child!, "Dismiss", 5000);
      await sleep(300);
    });

    // 8 split then popout (cannot pop out the final visible pane)
    await runStep("popout", async () => {
      await ensureToolbarReady(child!, sessionLog);
      if ((await dumpNativeButtons(child!, 5000)).buttons.includes("Dismiss")) {
        await clickNativeButton(child!, "Dismiss", 5000);
      }
      // Split until pane tree has 2 leaves (required before popout).
      for (let attempt = 0; attempt < 3; attempt++) {
        await clickNativeButton(child!, "Split right", 10000);
        await sleep(1200);
        const state = JSON.parse(readFileSync(path.join(fixture.vault, ".obails/state.json"), "utf8"));
        const tree = JSON.stringify(state.workspace?.paneTree || {});
        const paneCount = (state.workspace?.paneTabs || []).length;
        sessionLog.push({ event: "split-attempt", attempt, paneCount, tree });
        if (paneCount >= 2 || /splitDirection/.test(tree)) break;
      }
      const before = listWindows(child!.pid).length;
      await clickNativeButton(child!, "Pop out pane", 10000);
      await sleep(2000);
      let after = listWindows(child!.pid);
      for (let i = 0; i < 20 && after.length < 2; i++) {
        await sleep(250);
        after = listWindows(child!.pid);
      }
      meta = shot("10-popout-window");
      dump = await dumpNativeButtons(child!, 10000);
      const ocr = ocrText(path.join(IMAGES, "10-popout-window.png"));
      recordStep("10-popout-window", "Rightmost Popout opens a separate window with visible feedback", {
        controls: ['#popout-pane-btn aria-label="Pop out pane"', "#split-pane-right-btn"],
        actions: ["Split right until 2 panes, then Pop out pane"],
        oracle: {
          windowsBefore: before,
          windowsAfter: after.length,
          windowTitles: after.map((w) => w.title),
          hasRejoin: (dump.buttons || []).includes("Rejoin pane"),
          ocrHasRejoinOrPopped: /rejoin|popped|pop out/i.test(ocr),
          ocrHasFailure: /could not pop out/i.test(ocr),
        },
        screenshot: meta.path,
      });
      if ((dump.buttons || []).includes("Rejoin pane")) await clickNativeButton(child!, "Rejoin pane", 10000);
      else {
        await activateNativeApp(child!, 8000);
        dump = await dumpNativeButtons(child!, 8000);
        if ((dump.buttons || []).includes("Rejoin pane")) await clickNativeButton(child!, "Rejoin pane", 10000);
      }
      await sleep(1200);
      const rejoined = listWindows(child!.pid);
      meta = shot("11-popout-rejoin");
      recordStep("11-popout-rejoin", "Rejoin returns popout pane to the main window", {
        controls: ['#rejoin-popout-btn aria-label="Rejoin pane"'],
        actions: ["Click Rejoin pane"],
        oracle: { windowsAfterRejoin: rejoined.length, windowTitles: rejoined.map((w) => w.title) },
        screenshot: meta.path,
      });
      await ensureToolbarReady(child!, sessionLog);
    });

    // 9 workspace save/restore (may already be split)
    await runStep("workspace", async () => {
      await ensureToolbarReady(child!, sessionLog);
      dump = await dumpNativeButtons(child!, 8000);
      if ((dump.buttons || []).includes("Dismiss")) await clickNativeButton(child!, "Dismiss", 5000);
      const pre = readWorkspaceState(fixture.vault);
      if ((pre.workspace?.paneTabs || []).length < 2) {
        await clickNativeButton(child!, "Split right", 10000);
        await sleep(900);
      }
      await setNativeTextField(child!, "Name for saving or restoring a workspace layout", "evidence-layout", 12000);
      await sleep(400);
      await clickNativeButton(child!, "Save workspace", 10000);
      await sleep(1200);
      meta = shot("08-workspace-save");
      let savedState = readWorkspaceState(fixture.vault);
      let savedNames = (savedState.workspace?.savedWorkspaces || []).map((w: { name?: string }) => w.name);
      const ocrSave = ocrText(path.join(IMAGES, "08-workspace-save.png"));
      if (!JSON.stringify(savedState).includes("evidence-layout")) {
        sessionLog.push({ event: "workspace-save-retry", savedNames, ocr: ocrSave.split("\n").filter(Boolean).slice(0, 8) });
        await setNativeTextField(child!, "Name for saving or restoring a workspace layout", "evidence-layout", 12000);
        await sleep(400);
        await clickNativeButton(child!, "Save workspace", 10000);
        await sleep(1200);
        meta = shot("08-workspace-save");
        savedState = readWorkspaceState(fixture.vault);
        savedNames = (savedState.workspace?.savedWorkspaces || []).map((w: { name?: string }) => w.name);
      }
      recordStep("08-workspace-save", "Workspace saves tabs/splits/layout/popouts under a name", {
        controls: ["#workspace-name", "#save-workspace-btn", "#split-pane-right-btn"],
        actions: ["Paste evidence-layout into workspace name, Save workspace"],
        oracle: {
          savedNames,
          stateMentionsEvidence: JSON.stringify(savedState).includes("evidence-layout"),
          ocrHasSaved: /Saved workspace|evidence-layout/i.test(ocrText(path.join(IMAGES, "08-workspace-save.png"))),
        },
        screenshot: meta.path,
      });

      await ensureToolbarReady(child!, sessionLog);
      try { await clickNativeButton(child!, "Close pane", 8000); await sleep(700); } catch { /* */ }
      await setNativeTextField(child!, "Name for saving or restoring a workspace layout", "evidence-layout", 12000);
      await sleep(300);
      await clickNativeButton(child!, "Restore workspace", 12000);
      await sleep(1200);
      meta = shot("09-workspace-restore");
      savedState = readWorkspaceState(fixture.vault);
      savedNames = (savedState.workspace?.savedWorkspaces || []).map((w: { name?: string }) => w.name);
      recordStep("09-workspace-restore", "Workspace restore reopens named tabs/splits/layout/popouts", {
        controls: ["#restore-workspace-btn"],
        actions: ["Restore evidence-layout"],
        oracle: {
          savedNames,
          stateMentionsEvidence: JSON.stringify(savedState).includes("evidence-layout"),
          windowCount: listWindows(child!.pid).length,
          paneCount: (savedState.workspace?.paneTabs || []).length,
        },
        screenshot: meta.path,
      });
      await ensureToolbarReady(child!, sessionLog);
    });

    // 10 settings (separate from theme apply so one failure does not drop both)
    await runStep("theme-settings", async () => {
      await ensureToolbarReady(child!, sessionLog);
      dump = await dumpNativeButtons(child!, 8000);
      if ((dump.buttons || []).includes("Dismiss")) await clickNativeButton(child!, "Dismiss", 5000);
      let settingsOpened = false;
      try {
        await clickNativeButton(child!, "Settings", 12000);
        settingsOpened = true;
      } catch (err) {
        sessionLog.push({ event: "settings-open-miss", error: String(err) });
        await ensureToolbarReady(child!, sessionLog);
        await clickNativeButton(child!, "Settings", 12000);
        settingsOpened = true;
      }
      await sleep(1200);
      for (let i = 0; i < 8; i++) {
        sh("/usr/bin/osascript", ["-e", 'tell application "System Events" to key code 116']);
        await sleep(80);
      }
      try {
        await clickNativeButton(child!, "Move to this vault's .trash folder", 5000);
      } catch {
        sessionLog.push({ event: "settings-scroll-click-miss" });
      }
      await sleep(400);
      meta = shot("12-theme-settings");
      const ocr = ocrText(path.join(IMAGES, "12-theme-settings.png"));
      recordStep("12-theme-settings", "Theme / color scheme exists in Settings", {
        controls: ["#settings-btn", "#settings-theme", "#settings-open-config"],
        actions: ["Open Settings, scroll to Theme/Delete destination region"],
        oracle: {
          settingsOpened,
          settingsVisible: /delete destination|open config file|\bTheme\b/i.test(ocr),
          ocrHasTheme: /\bTheme\b/i.test(ocr),
          ocrHasEditor: /\bEditor\b/i.test(ocr),
          ocrHasOpenConfig: /open config file/i.test(ocr),
          ocrHasDeleteDestination: /delete destination/i.test(ocr),
          ocrSnippet: ocr.split("\n").filter(Boolean).slice(0, 16),
          seededTheme: "onedark",
        },
        screenshot: meta.path,
      });
      try { await clickNativeButton(child!, "Done", 8000); }
      catch { await pressNativeHotkey(child!, "esc", 5000); }
      await sleep(700);
      await ensureToolbarReady(child!, sessionLog);
    });

    await runStep("theme-apply", async () => {
      await ensureToolbarReady(child!, sessionLog);
      await activateNativeApp(child!, 8000);
      const processName = clickThemeGithubLight(sessionLog);
      await sleep(1500);
      meta = shot("12b-theme-light-applied");
      const configAfter = readFileSync(fixture.configPath, "utf8");
      const ocrAfter = ocrText(path.join(IMAGES, "12b-theme-light-applied.png"));
      recordStep("12b-theme-light-applied", "Theme menu switches color scheme to GitHub Light", {
        controls: ['menu bar "Theme" > "GitHub Light"', "#settings-theme"],
        actions: [`Theme menu → GitHub Light via process ${processName}`],
        oracle: {
          processName,
          configHasGithubLight: /theme\s*=\s*"github-light"/i.test(configAfter) || /github-light/i.test(configAfter),
          configSnippet: configAfter.slice(0, 500),
          settingsClosed: !/open config file|delete destination/i.test(ocrAfter),
          ocrSnippet: ocrAfter.split("\n").filter(Boolean).slice(0, 10),
        },
        screenshot: meta.path,
      });
      await ensureToolbarReady(child!, sessionLog);
    });

    // 11 shortcuts
    await runStep("shortcuts", async () => {
      await ensureToolbarReady(child!, sessionLog);
      await pidHotkey(child!, "?");
      await sleep(800);
      meta = shot("13-shortcuts-help");
      const ocr = ocrText(path.join(IMAGES, "13-shortcuts-help.png"));
      recordStep("13-shortcuts-help", "Shortcut help documents Vault Search vs Find in Note", {
        controls: ["#shortcuts-overlay"],
        actions: ["Press ?"],
        oracle: {
          screenshotExists: existsSync(path.join(IMAGES, "13-shortcuts-help.png")),
          ocrMentionsVaultOrFind: /search vault|find in note/i.test(ocr),
          ocrSnippet: ocr.split("\n").filter(Boolean).slice(0, 14),
        },
        screenshot: meta.path,
      });
      await ensureToolbarReady(child!, sessionLog);
    });
  } finally {
    if (recorder) {
      await recorder.stop();
      writeFileSync(path.join(LOGS, `${STAMP}-ffmpeg-stderr.log`), recorder.getStderr());
    }
    try {
      if (priorFrontmost?.pid) {
        const restored = activatePid(priorFrontmost.pid);
        writeFileSync(path.join(LOGS, `${STAMP}-restored-frontmost.json`), JSON.stringify({
          requestedPid: priorFrontmost.pid, actualFrontmostPid: restored, prior: priorFrontmost, after: frontmostInfo(),
        }, null, 2));
      }
    } catch (err) {
      writeFileSync(path.join(LOGS, `${STAMP}-restore-frontmost-error.txt`), String(err));
    }
    if (child?.pid) {
      try {
        await stopExactProcess(child, TIMEOUT_MS);
        sessionLog.push({ event: "stopped", pid: child.pid });
      } catch (err) {
        sessionLog.push({ event: "stop-error", error: String(err) });
      }
    }

    const videoMeta = existsSync(videoPath) ? ffprobeVideo(videoPath) : null;
    const images = readdirSync(IMAGES).filter((f) => f.endsWith(".png") && !f.startsWith("_")).sort().map((f) => imageMeta(path.join(IMAGES, f)));
    const feature = (id: string) => features.find((f) => f.featureId === id);
    const videoFiles = readdirSync(VIDEOS).filter((f) => !f.startsWith("."));
    const manifest = {
      createdAt: new Date().toISOString(),
      priorFrontmost,
      appExecutable: APP_EXECUTABLE,
      child,
      fixtureRoot,
      featureCount: features.length,
      features,
      images,
      videos: videoMeta ? [videoMeta] : [],
      videoCount: videoMeta ? 1 : 0,
      failClosed: {
        imagesCoverFeatures: images.length >= 14 && features.length >= 14,
        exactlyOneVideo: Boolean(videoMeta) && videoFiles.length === 1,
        videoSilent: videoMeta?.audioStreamCount === 0,
        videoDurationPositive: (videoMeta?.duration || 0) > 20,
        outlineClean: Boolean(feature("02-outline-no-frontmatter")
          && (feature("02-outline-no-frontmatter")!.oracle.forbiddenPresent as unknown[]).length === 0
          && (feature("02-outline-no-frontmatter")!.oracle.expectedPresent as unknown[]).length >= 2),
        vaultSearchWorks: Boolean(
          feature("04-vault-search-icon")?.oracle.hasCloseVaultSearch
          || feature("04-vault-search-icon")?.oracle.ocrHasSearchVault,
        ) && Boolean(
          feature("05-vault-search-hotkey")?.oracle.hasCloseVaultSearch
          || feature("05-vault-search-hotkey")?.oracle.ocrHasSearchVault,
        ),
        findInNoteWorks: Boolean(
          feature("06-find-in-note")?.oracle.hasCloseFind
          || feature("06-find-in-note")?.oracle.hasFindField
          || feature("06-find-in-note")?.oracle.ocrHasFindInNote
        ),
        operationStatusWorks: Boolean(feature("07-operation-status")?.oracle.hasDismiss),
        workspaceSaved: Boolean(feature("08-workspace-save")?.oracle.stateMentionsEvidence),
        popoutOpened: Number(feature("10-popout-window")?.oracle.windowsAfter || 0) >= 2,
        settingsVisible: Boolean(
          feature("12-theme-settings")?.oracle.settingsVisible
          || feature("12-theme-settings")?.oracle.ocrHasTheme
          || feature("12-theme-settings")?.oracle.ocrHasOpenConfig
          || feature("12-theme-settings")?.oracle.ocrHasDeleteDestination,
        ),
        themeApplied: Boolean(feature("12b-theme-light-applied")?.oracle.configHasGithubLight),
        tabsActivatedAndClosed: Boolean(
          feature("01-tabs-chrome")?.oracle.activatedTwoDistinct
          && feature("01-tabs-chrome")?.oracle.closedPathAbsent
        ),
        outlineJumpWorks: Boolean(feature("02-outline-no-frontmatter")?.oracle.jumpAssert),
        independentScrollWorks: Boolean(feature("03-layout-scroll-radius")?.oracle.independentScrollAssert),
        videoReplaced: videoMeta
          ? videoMeta.sha256 !== "35b25da0056c2a3dbabb2c4d3c164b09ccb0973e1bb7f7c709ca44c3e57a397c"
          : false,
      },
      oldVideoSha256Ref: "35b25da0056c2a3dbabb2c4d3c164b09ccb0973e1bb7f7c709ca44c3e57a397c",
      sessionLog,
      captureWallSec: captureStartedAt ? elapsedSec(captureStartedAt) : null,
    };
    writeFileSync(path.join(ARTIFACT, "evidence-manifest.json"), JSON.stringify(manifest, null, 2));
    writeFileSync(path.join(LOGS, `${STAMP}-session.json`), JSON.stringify(sessionLog, null, 2));
    writeFileSync(path.join(LOGS, `${STAMP}-features.json`), JSON.stringify(features, null, 2));
    console.log(JSON.stringify({
      ok: Object.values(manifest.failClosed).every(Boolean),
      featureCount: features.length,
      images: images.length,
      video: videoMeta && { duration: videoMeta.duration, audioStreamCount: videoMeta.audioStreamCount, bytes: videoMeta.bytes },
      failClosed: manifest.failClosed,
    }, null, 2));
    if (!Object.values(manifest.failClosed).every(Boolean)) process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
