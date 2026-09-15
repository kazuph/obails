import { spawnSync } from "node:child_process";

const filters = process.argv.slice(2);
const suites = filters.length
  ? [["test", ...filters]]
  : [["test"], ["test", "--config", "playwright.real.config.ts"]];
for (const args of suites) {
  const result = spawnSync("pnpm", ["exec", "playwright", ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
