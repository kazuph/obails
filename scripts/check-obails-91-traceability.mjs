import { readFileSync } from "node:fs";

const tracePath = new URL("../.codex/obails-91-traceability.md", import.meta.url);
const source = readFileSync(tracePath, "utf8");
const rows = [...source.matchAll(/^\| (P-\d{3}) \| ([^|]+) \| ([^|]+) \| (.*) \|$/gm)].map((match) => ({
  id: match[1],
  contract: match[2].trim(),
  status: match[3].trim(),
  evidence: match[4].trim(),
}));

const errors = [];
const byId = new Map();
for (const row of rows) {
  const duplicates = byId.get(row.id) ?? [];
  duplicates.push(row);
  byId.set(row.id, duplicates);
}

for (let number = 1; number <= 92; number += 1) {
  const id = `P-${String(number).padStart(3, "0")}`;
  const matches = byId.get(id) ?? [];
  if (matches.length !== 1) {
    errors.push(`${id}: expected exactly one row, found ${matches.length}`);
    continue;
  }
  const [row] = matches;
  if (row.status !== "verified" && row.status !== "accepted") {
    errors.push(`${id}: status is ${row.status}, expected verified or accepted`);
  }
  if (!row.evidence || /\bpending\b|\bTBD\b|\bunverified\b|未確認|未検証|未実行|未接続|未完/i.test(row.evidence)) {
    errors.push(`${id}: evidence is incomplete`);
  }
}

const excluded = byId.get("P-093") ?? [];
if (excluded.length !== 1 || excluded[0].status !== "excluded") {
  errors.push("P-093: expected exactly one excluded row");
}

for (const id of byId.keys()) {
  if (!/^P-(?:0(?:0[1-9]|[1-8]\d|9[0-3]))$/.test(id)) {
    errors.push(`${id}: outside the P-001 through P-093 contract`);
  }
}

if (errors.length > 0) {
  console.error(`TRACEABILITY_RED ${errors.length}`);
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("TRACEABILITY_GREEN P-001_THROUGH_P-092_VERIFIED P-093_EXCLUDED");
