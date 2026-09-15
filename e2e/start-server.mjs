import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(path.join(tmpdir(), "obails-e2e-server-"));
const executable = path.join(directory, "obails-e2e");
for (const [command, args] of [
  ["pnpm", ["--dir", "frontend", "run", "build"]],
  ["go", ["build", "-tags", "e2e", "-o", executable, "."]],
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    rmSync(directory, { recursive: true, force: true });
    process.exit(result.status ?? 1);
  }
}
const child = spawn(executable, [], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    OBAILS_CONFIG_FILE: path.join(root, "e2e/fixtures/config.e2e.toml"),
    OBAILS_E2E_PORT: process.argv[2],
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  rmSync(directory, { recursive: true, force: true });
  process.exit(code ?? 0);
});
