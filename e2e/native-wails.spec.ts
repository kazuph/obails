import { expect, test } from "@playwright/test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NATIVE_WAILS_TIMEOUT_MS } from "../playwright.native.config";
import {
  activateNativeApp,
  executablePIDs,
  NativeAxHelperError,
  type NativeAppProcess,
  replaceNativeEditorText,
  saveNativeDocument,
  startNativeApp,
  stopExactProcess,
  surveyNativeAccessibility,
  waitForNativeEditorReady,
  waitForNativeWindows,
} from "./helpers/native-wails-launch";

const APP_EXECUTABLE = path.resolve("bin/obails.dev.app/Contents/MacOS/obails");
const EXPECTED_NOTE_CONTENT = "# Native\n\nsaved by native AX E2E\n";

test("Obails Dev native WKWebView saves Native.md through AX keyboard input", async ({}, testInfo) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "obails-native-wails-"));
  const vaultPath = path.join(temporaryRoot, "vault");
  const stateDirectory = path.join(vaultPath, ".obails");
  const configPath = path.join(temporaryRoot, "config.toml");
  const logPath = path.join(temporaryRoot, "native.log");
  const nativeNotePath = path.join(vaultPath, "Native.md");
  const initialBytes = Buffer.from("# Native\n\nseed content\n", "utf8");

  await mkdir(stateDirectory, { recursive: true });
  await writeFile(nativeNotePath, initialBytes);
  await writeFile(configPath, `[vault]\n  path = ${JSON.stringify(vaultPath)}\n  delete_mode = "vault_trash"\n`, "utf8");
  await writeFile(path.join(stateDirectory, "state.json"), JSON.stringify({
    lastOpenedFile: { path: "Native.md", fileType: "markdown" },
    workspace: {
      paneTree: { paneId: "native-main" },
      activePaneId: "native-main",
      paneTabs: [{
        paneId: "native-main",
        tabs: [{ path: "Native.md", fileType: "markdown" }],
        activeTabPath: "Native.md",
      }],
    },
  }, null, 2), "utf8");

  const pidsBeforeLaunch = executablePIDs(APP_EXECUTABLE);
  let child: NativeAppProcess | null = null;
  let nativeWindows: Array<{ windowNumber: number; title: string; bounds: { Width: number; Height: number } }> = [];
  let accessibilitySurvey: Awaited<ReturnType<typeof surveyNativeAccessibility>> | null = null;
  let bytesBeforeSave: Buffer | null = null;
  let bytesAfterSave: Buffer | null = null;

  try {
    child = await startNativeApp(APP_EXECUTABLE, configPath, logPath, NATIVE_WAILS_TIMEOUT_MS);

    nativeWindows = await waitForNativeWindows(child, NATIVE_WAILS_TIMEOUT_MS);
    expect(nativeWindows).toHaveLength(1);
    expect(nativeWindows[0].title).toBe("Obails Dev");
    expect(nativeWindows[0].windowNumber).toBeGreaterThan(0);
    expect(nativeWindows[0].bounds.Width).toBeGreaterThan(0);
    expect(nativeWindows[0].bounds.Height).toBeGreaterThan(0);

    const activation = await activateNativeApp(child, NATIVE_WAILS_TIMEOUT_MS);
    expect(activation.ok).toBe(true);
    expect(activation.frontmost).toBe(true);
    expect(activation.pid).toBe(child.pid);

    accessibilitySurvey = await waitForNativeEditorReady(child, "Native", NATIVE_WAILS_TIMEOUT_MS);
    expect(accessibilitySurvey.webAreaCount).toBeGreaterThan(0);
    expect(accessibilitySurvey.buttonCount).toBeGreaterThan(0);
    expect(accessibilitySurvey.namedButtons.Settings).toBe(true);
    expect(accessibilitySurvey.namedButtons["New Note"]).toBe(true);

    bytesBeforeSave = await readFile(nativeNotePath);
    expect(bytesBeforeSave.equals(initialBytes)).toBe(true);

    const replaceResult = await replaceNativeEditorText(child, EXPECTED_NOTE_CONTENT, NATIVE_WAILS_TIMEOUT_MS);
    expect(replaceResult.ok).toBe(true);
    expect(replaceResult.pid).toBe(child.pid);

    const saveResult = await saveNativeDocument(child, NATIVE_WAILS_TIMEOUT_MS);
    expect(saveResult.ok).toBe(true);
    expect(saveResult.pid).toBe(child.pid);

    const deadline = Date.now() + NATIVE_WAILS_TIMEOUT_MS;
    while (Date.now() < deadline) {
      bytesAfterSave = await readFile(nativeNotePath);
      if (bytesAfterSave.equals(Buffer.from(EXPECTED_NOTE_CONTENT, "utf8"))) break;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    expect(bytesAfterSave).not.toBeNull();
    expect(bytesAfterSave!.equals(Buffer.from(EXPECTED_NOTE_CONTENT, "utf8"))).toBe(true);

    await testInfo.attach("native-wails-evidence", {
      body: JSON.stringify({
        pid: child.pid,
        CGWindow: nativeWindows,
        AXSurvey: accessibilitySurvey,
        bytesBefore: bytesBeforeSave.toString("utf8"),
        bytesAfter: bytesAfterSave!.toString("utf8"),
        activation,
      }, null, 2),
      contentType: "application/json",
    });
  } catch (error) {
    const nativeLog = await readFile(logPath, "utf8").catch(() => "<native log unavailable>");
    const axDetail = error instanceof NativeAxHelperError
      ? JSON.stringify({
        kind: error.kind,
        structured: error.structured,
        stderr: error.stderr,
        stdout: error.stdout,
      })
      : (error instanceof Error ? error.message : String(error));
    throw new Error(`${axDetail}\nCGWindow: ${JSON.stringify(nativeWindows)}\nAX survey: ${JSON.stringify(accessibilitySurvey)}\nBytes before: ${bytesBeforeSave?.toString("utf8") ?? "<unread>"}\nBytes after: ${bytesAfterSave?.toString("utf8") ?? "<unread>"}\nNative log:\n${nativeLog}`);
  } finally {
    if (child) {
      await stopExactProcess(child, NATIVE_WAILS_TIMEOUT_MS);
    }
    await rm(temporaryRoot, { recursive: true, force: true });
    const pidsAfterCleanup = executablePIDs(APP_EXECUTABLE);
    const orphans = [...pidsAfterCleanup].filter((pid) => !pidsBeforeLaunch.has(pid));
    expect(orphans, `orphan obails processes after cleanup: ${orphans.join(", ") || "none"}`).toEqual([]);
  }
});
