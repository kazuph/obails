import { execFile, execFileSync, spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WINDOW_HELPER_PATH = path.resolve("e2e/helpers/wails-window.swift");
const AX_HELPER_PATH = path.resolve("e2e/helpers/wails-ax.swift");
const AX_HELPER_BIN = path.join(os.tmpdir(), "obails-wails-ax");
let axHelperReady: Promise<string> | null = null;

async function axHelperExecutable(): Promise<string> {
  if (!axHelperReady) {
    axHelperReady = (async () => {
      await mkdir(path.dirname(AX_HELPER_BIN), { recursive: true });
      const [sourceStat, binaryStat] = await Promise.all([
        stat(AX_HELPER_PATH),
        stat(AX_HELPER_BIN).catch(() => null),
      ]);
      if (!binaryStat || sourceStat.mtimeMs > binaryStat.mtimeMs) {
        await execFileAsync("/usr/bin/swiftc", ["-o", AX_HELPER_BIN, AX_HELPER_PATH]);
      }
      return AX_HELPER_BIN;
    })();
  }
  return axHelperReady;
}

export type NativeAppProcess = { pid: number; executable: string };
export type NativeWindow = {
  windowNumber: number;
  title: string;
  bounds: { X: number; Y: number; Width: number; Height: number };
};

export type AxHelperErrorKind =
  | "tcc"
  | "identity"
  | "not_frontmost"
  | "ambiguous"
  | "disabled"
  | "missing"
  | "usage"
  | "timeout"
  | "ax_failure"
  | "exec_failure"
  | "unknown";

export type StructuredAxError = { error: string };

export class NativeAxHelperError extends Error {
  readonly kind: AxHelperErrorKind;
  readonly structured: StructuredAxError | null;
  readonly stdout: string;
  readonly stderr: string;

  constructor(
    message: string,
    kind: AxHelperErrorKind,
    structured: StructuredAxError | null,
    stdout: string,
    stderr: string,
  ) {
    const detail = structured?.error ?? message;
    const stderrText = stderr.trim();
    super(stderrText ? `${detail} (kind=${kind}, stderr=${stderrText})` : `${detail} (kind=${kind})`);
    this.name = "NativeAxHelperError";
    this.kind = kind;
    this.structured = structured;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export function executablePIDs(executable: string): Set<number> {
  const expected = path.resolve(executable);
  const rows = execFileSync("/bin/ps", ["-axo", "pid=,comm="], { encoding: "utf8" }).split("\n");
  return new Set(rows.flatMap((row) => {
    const match = row.trim().match(/^(\d+)\s+(.+)$/);
    return match && path.resolve(match[2]) === expected ? [Number(match[1])] : [];
  }));
}

function runningExecutable(pid: number): string {
  return execFileSync("/bin/ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" }).trim();
}

export function assertExactExecutable(child: NativeAppProcess): void {
  try {
    process.kill(child.pid, 0);
  } catch {
    throw new NativeAxHelperError(
      `PID ${child.pid} is not running`,
      "missing",
      { error: `PID ${child.pid} is not running` },
      "",
      "",
    );
  }
  const actual = path.resolve(runningExecutable(child.pid));
  if (actual !== child.executable) {
    throw new NativeAxHelperError(
      `Executable identity mismatch for PID ${child.pid}: expected ${child.executable}, got ${actual}`,
      "identity",
      { error: `Executable identity mismatch for PID ${child.pid}: expected ${child.executable}, got ${actual}` },
      "",
      "",
    );
  }
}

function parseStructuredAxError(payload: string): StructuredAxError | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as { error?: string };
    return typeof parsed.error === "string" ? { error: parsed.error } : null;
  } catch {
    const match = trimmed.match(/\{"error":.*\}/s);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as { error?: string };
      return typeof parsed.error === "string" ? { error: parsed.error } : null;
    } catch {
      return null;
    }
  }
}

function classifyAxError(message: string): AxHelperErrorKind {
  const lower = message.toLowerCase();
  if (lower.includes("tcc") || lower.includes("accessibility permission") || lower.includes("api disabled")) {
    return "tcc";
  }
  if (lower.includes("executable identity mismatch") || (lower.includes("expected") && lower.includes("got"))) {
    return "identity";
  }
  if (lower.includes("not frontmost")) return "not_frontmost";
  if (lower.includes("ambiguous")) return "ambiguous";
  if (lower.includes("disabled")) return "disabled";
  if (
    lower.includes("missing")
    || lower.includes("pending after source toggle")
    || lower.includes("did not become")
    || lower.includes("no nsrunningapplication")
    || lower.includes("is not running")
  ) {
    return "missing";
  }
  if (lower.includes("usage") || lower.includes("unknown command")) return "usage";
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("within") && lower.includes("ms")) {
    return "timeout";
  }
  if (lower.includes("accessibility")) return "ax_failure";
  return "unknown";
}

function isRetryableAxError(kind: AxHelperErrorKind, message: string): boolean {
  if (kind === "exec_failure" || kind === "not_frontmost" || kind === "timeout") {
    return true;
  }
  if (kind === "missing" && message.toLowerCase().includes("pending after source toggle")) {
    return true;
  }
  return false;
}

function extractExecOutput(error: unknown): { stdout: string; stderr: string; message: string; killed: boolean } {
  const message = error instanceof Error ? error.message : String(error);
  if (typeof error === "object" && error !== null) {
    const record = error as { stdout?: string | Buffer; stderr?: string | Buffer; killed?: boolean };
    const stdout = typeof record.stdout === "string"
      ? record.stdout
      : Buffer.isBuffer(record.stdout)
        ? record.stdout.toString("utf8")
        : "";
    const stderr = typeof record.stderr === "string"
      ? record.stderr
      : Buffer.isBuffer(record.stderr)
        ? record.stderr.toString("utf8")
        : "";
    return { stdout, stderr, message, killed: record.killed === true };
  }
  return { stdout: "", stderr: "", message, killed: false };
}

function toNativeAxHelperError(error: unknown): NativeAxHelperError {
  if (error instanceof NativeAxHelperError) return error;
  const { stdout, stderr, message, killed } = extractExecOutput(error);
  const structured = parseStructuredAxError(stderr) ?? parseStructuredAxError(stdout) ?? parseStructuredAxError(message);
  if (killed && !stderr.trim() && !structured) {
    return new NativeAxHelperError(
      "Swift helper was terminated before returning structured AX output",
      "timeout",
      { error: "Swift helper was terminated before returning structured AX output" },
      stdout,
      stderr,
    );
  }
  const text = structured?.error ?? message;
  const kind = structured ? classifyAxError(text) : "exec_failure";
  return new NativeAxHelperError(text, kind, structured, stdout, stderr);
}

function combineErrors(primary: Error, cleanupErrors: Error[]): Error {
  if (cleanupErrors.length === 0) return primary;
  const cleanupSummary = cleanupErrors.map((error) => error.message).join("; ");
  return new AggregateError([primary, ...cleanupErrors], `${primary.message}; cleanup failures: ${cleanupSummary}`);
}

async function cleanupExactPIDs(executable: string, pids: number[], timeoutMs: number): Promise<Error[]> {
  const resolved = path.resolve(executable);
  const errors: Error[] = [];
  for (const pid of pids) {
    try {
      process.kill(pid, 0);
    } catch {
      continue;
    }
    try {
      const actual = path.resolve(runningExecutable(pid));
      if (actual !== resolved) {
        continue;
      }
      await stopExactProcess({ pid, executable: resolved }, timeoutMs);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  const survivors = pids.filter((pid) => executablePIDs(resolved).has(pid));
  if (survivors.length > 0) {
    errors.push(new Error(`PIDs still running after cleanup: ${survivors.join(", ")}`));
  }
  return errors;
}

export async function startNativeApp(executable: string, configPath: string, logPath: string, timeoutMs: number): Promise<NativeAppProcess> {
  const resolvedExecutable = path.resolve(executable);
  const before = executablePIDs(resolvedExecutable);
  const bundlePath = path.dirname(path.dirname(path.dirname(resolvedExecutable)));

  try {
    const launcher = spawn("/usr/bin/open", ["-n", "-o", logPath, "--stderr", logPath, "--env", `OBAILS_CONFIG_FILE=${configPath}`, bundlePath], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const launcherExit = await new Promise<number | null>((resolve, reject) => {
      launcher.once("error", reject);
      launcher.once("exit", resolve);
    });
    if (launcherExit !== 0) {
      throw new Error("LaunchServices could not start the native Wails bundle");
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const created = [...executablePIDs(resolvedExecutable)].filter((pid) => !before.has(pid));
      if (created.length === 1) {
        return { pid: created[0], executable: resolvedExecutable };
      }
      if (created.length > 1) {
        throw new Error(`Native launch created multiple matching PIDs: ${created.join(", ")}`);
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    throw new Error("Timed out resolving the exact PID launched by LaunchServices");
  } catch (error) {
    const created = [...executablePIDs(resolvedExecutable)].filter((pid) => !before.has(pid));
    const cleanupErrors = created.length > 0
      ? await cleanupExactPIDs(resolvedExecutable, created, timeoutMs)
      : [];
    const primary = error instanceof Error ? error : new Error(String(error));
    throw combineErrors(primary, cleanupErrors);
  }
}

export async function waitForNativeWindows(child: NativeAppProcess, timeoutMs: number): Promise<NativeWindow[]> {
  assertExactExecutable(child);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assertExactExecutable(child);
    const { stdout } = await execFileAsync("/usr/bin/swift", [WINDOW_HELPER_PATH, String(child.pid)], {
      maxBuffer: 1024 * 1024,
      timeout: Math.max(1, deadline - Date.now()),
    });
    const windows = JSON.parse(stdout.trim()) as NativeWindow[];
    if (windows.length > 0) return windows;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Timed out waiting for an exact-PID native window");
}

export type NativeAxSurvey = {
  webAreaCount: number;
  buttonCount: number;
  buttons: string[];
  namedButtons: Record<string, boolean>;
};

export type NativeAxActivate = {
  ok: boolean;
  frontmost: boolean;
  pid: number;
};

export type NativeAxAction = {
  ok: boolean;
  pid: number;
};

async function runAxHelper<T>(command: string, child: NativeAppProcess, timeoutMs: number, extraArgs: string[] = []): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let sourceToggleAttempted = false;
  while (true) {
    assertExactExecutable(child);
    const remainingMs = Math.max(1, deadline - Date.now());
    const commandArgs = command === "replace-editor-text" && sourceToggleAttempted
      ? ["--no-toggle", ...extraArgs]
      : extraArgs;
    try {
      const axExecutable = await axHelperExecutable();
      const { stdout, stderr } = await execFileAsync(
        axExecutable,
        [command, String(child.pid), String(remainingMs), ...commandArgs],
        {
          maxBuffer: 4 * 1024 * 1024,
          timeout: remainingMs,
        },
      );
      if (stderr.trim()) {
        const structured = parseStructuredAxError(stderr);
        if (structured) {
          const kind = classifyAxError(structured.error);
          throw new NativeAxHelperError(structured.error, kind, structured, stdout, stderr);
        }
      }
      return JSON.parse(stdout.trim()) as T;
    } catch (error) {
      const axError = toNativeAxHelperError(error);
      if (
        command === "replace-editor-text"
        && !sourceToggleAttempted
        && axError.structured?.error.toLowerCase().includes("pending after source toggle")
      ) {
        sourceToggleAttempted = true;
        if (Date.now() >= deadline) {
          throw axError;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        continue;
      }
      if (
        command === "replace-editor-text"
        && sourceToggleAttempted
        && axError.kind === "missing"
      ) {
        if (Date.now() >= deadline) {
          throw axError;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        continue;
      }
      if (!isRetryableAxError(axError.kind, axError.structured?.error ?? axError.message) || Date.now() >= deadline) {
        throw axError;
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}

export async function activateNativeApp(child: NativeAppProcess, timeoutMs: number): Promise<NativeAxActivate> {
  return runAxHelper<NativeAxActivate>("activate", child, timeoutMs);
}

export async function surveyNativeAccessibility(child: NativeAppProcess, timeoutMs: number): Promise<NativeAxSurvey> {
  return runAxHelper<NativeAxSurvey>("survey", child, timeoutMs);
}

export async function replaceNativeEditorText(child: NativeAppProcess, text: string, timeoutMs: number): Promise<NativeAxAction> {
  return runAxHelper<NativeAxAction>("replace-editor-text", child, timeoutMs, [
    "--base64",
    Buffer.from(text, "utf8").toString("base64"),
  ]);
}

export async function saveNativeDocument(child: NativeAppProcess, timeoutMs: number): Promise<NativeAxAction> {
  return runAxHelper<NativeAxAction>("save", child, timeoutMs);
}

export async function clickNativeButton(child: NativeAppProcess, buttonName: string, timeoutMs: number): Promise<NativeAxAction> {
  return runAxHelper<NativeAxAction>("click-button", child, timeoutMs, [buttonName]);
}

export async function setNativeTextField(
  child: NativeAppProcess,
  fieldName: string,
  text: string,
  timeoutMs: number,
): Promise<NativeAxAction> {
  return runAxHelper<NativeAxAction>("set-text-field", child, timeoutMs, [
    fieldName,
    "--base64",
    Buffer.from(text, "utf8").toString("base64"),
  ]);
}

export async function pressNativeHotkey(child: NativeAppProcess, hotkey: string, timeoutMs: number): Promise<NativeAxAction> {
  return runAxHelper<NativeAxAction>("press-hotkey", child, timeoutMs, [hotkey]);
}

export async function dumpNativeButtons(
  child: NativeAppProcess,
  timeoutMs: number,
): Promise<{ pid: number; webAreaCount: number; buttons: string[]; extras?: Array<{ role: string; name: string }> }> {
  return runAxHelper<{ pid: number; webAreaCount: number; buttons: string[]; extras?: Array<{ role: string; name: string }> }>("dump-buttons", child, timeoutMs);
}

export async function setNativePopup(
  child: NativeAppProcess,
  popupName: string,
  optionLabel: string,
  timeoutMs: number,
): Promise<NativeAxAction> {
  return runAxHelper<NativeAxAction>("set-popup", child, timeoutMs, [popupName, optionLabel]);
}

export async function focusNativeEditor(
  child: NativeAppProcess,
  timeoutMs: number,
  paneId = "native-main",
): Promise<NativeAxAction> {
  return runAxHelper<NativeAxAction>("focus-editor", child, timeoutMs, [paneId]);
}

export async function frameNativeNamed(
  child: NativeAppProcess,
  accessibleName: string,
  timeoutMs: number,
): Promise<{ ok: boolean; pid: number; name: string; x: number; y: number; width: number; height: number }> {
  return runAxHelper("frame-named", child, timeoutMs, [accessibleName]);
}

export async function scrollNativeWheelAt(
  child: NativeAppProcess,
  x: number,
  y: number,
  deltaLines: number,
  timeoutMs: number,
): Promise<{ ok: boolean; pid: number; x: number; y: number; deltaApplied: number }> {
  return runAxHelper("scroll-wheel-at", child, timeoutMs, [String(x), String(y), String(deltaLines)]);
}

export async function waitForNativeEditorReady(child: NativeAppProcess, heading: string, timeoutMs: number): Promise<NativeAxSurvey> {
  assertExactExecutable(child);
  const deadline = Date.now() + timeoutMs;
  const marker = `Go to heading: ${heading}`;
  while (Date.now() < deadline) {
    assertExactExecutable(child);
    const survey = await surveyNativeAccessibility(child, Math.max(1, deadline - Date.now()));
    if (survey.buttons.includes(marker)) return survey;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for native editor heading marker: ${marker}`);
}

export async function stopExactProcess(child: NativeAppProcess, timeoutMs: number): Promise<void> {
  try {
    process.kill(child.pid, 0);
  } catch {
    return;
  }
  assertExactExecutable(child);
  process.kill(child.pid, "SIGTERM");
  const termDeadline = Date.now() + timeoutMs;
  while (Date.now() < termDeadline) {
    try {
      process.kill(child.pid, 0);
    } catch {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assertExactExecutable(child);
  process.kill(child.pid, "SIGKILL");
  const killDeadline = Date.now() + timeoutMs;
  while (Date.now() < killDeadline) {
    try {
      process.kill(child.pid, 0);
    } catch {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`PID ${child.pid} did not terminate after SIGKILL within ${timeoutMs}ms`);
}
