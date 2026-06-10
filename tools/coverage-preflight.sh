#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_DIR="$ROOT/mcp-server"
COVERAGE_JSON="$MCP_DIR/coverage/coverage-final.json"
EVIDENCE_JSON="$MCP_DIR/coverage/coverage-evidence.json"
BASE_BRANCH="${GITHUB_BASE_REF:-main}"
IS_PR="false"
CHANGED_FILES_JSON="[]"
CHANGED_LINES_JSON="{}"
export GITHUB_BASE_REF="$BASE_BRANCH"
export GITHUB_SHA="${GITHUB_SHA:-$(git -C "$ROOT" rev-parse HEAD)}"
export GITHUB_REF_NAME="${GITHUB_REF_NAME:-$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)}"

if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" || -n "${GITHUB_BASE_REF:-}" ]]; then
  IS_PR="true"
  git -C "$ROOT" fetch --no-tags --depth=1 origin "$BASE_BRANCH" >/dev/null 2>&1 || true
  # Entry-point wrappers are covered by subprocess integration tests.
  CHANGED_FILES_JSON="$(
    { git -C "$ROOT" diff --name-only "origin/$BASE_BRANCH"...HEAD -- 'mcp-server/src/*.ts' 'mcp-server/src/**/*.ts' \
      | grep -Ev '(^|/)(__tests__|fixtures)/|\.test\.ts$|^mcp-server/src/(bootstrap|config|edit-guard|index|record-reminder)\.ts$' || true; } \
      | sed 's#^mcp-server/##' \
      | node -e 'const fs = require("fs"); const files = fs.readFileSync(0, "utf8").split(/\n/).filter(Boolean); process.stdout.write(JSON.stringify(files));'
  )"
  # Per-file added/modified line numbers (new-file side) from the PR diff, so the
  # changed-scope gate only requires the lines you touched to be covered. Keyed
  # by the same mcp-server-relative paths as CHANGED_FILES_JSON.
  CHANGED_LINES_JSON="$(
    { git -C "$ROOT" diff --unified=0 "origin/$BASE_BRANCH"...HEAD -- 'mcp-server/src/*.ts' 'mcp-server/src/**/*.ts' || true; } \
      | node -e '
        const fs = require("fs");
        const diff = fs.readFileSync(0, "utf8").split(/\n/);
        const map = {};
        let file = null;
        let newLine = 0;
        for (const line of diff) {
          if (line.startsWith("+++ ")) {
            const p = line.slice(4).replace(/^b\//, "").replace(/^mcp-server\//, "").trim();
            file = p === "/dev/null" ? null : p;
            continue;
          }
          const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
          if (hunk) { newLine = parseInt(hunk[1], 10); continue; }
          if (line.startsWith("+++") || line.startsWith("---")) continue;
          if (line.startsWith("+")) {
            if (file) (map[file] ||= []).push(newLine);
            newLine += 1;
          } else if (line.startsWith(" ")) {
            newLine += 1;
          }
        }
        process.stdout.write(JSON.stringify(map));
      '
  )"
fi

cd "$MCP_DIR"
npm run build
npm run test:coverage

cd "$ROOT"
export COVERAGE_JSON EVIDENCE_JSON IS_PR CHANGED_FILES_JSON CHANGED_LINES_JSON
node --input-type=module <<'NODE'
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { generateCoverageEvidence, validateCoverageEvidence } from './mcp-server/build/utils/coverage-evidence.js';

const coveragePath = process.env.COVERAGE_JSON;
const evidencePath = process.env.EVIDENCE_JSON;
const changedFiles = JSON.parse(process.env.CHANGED_FILES_JSON || '[]');
const changedLineRanges = process.env.IS_PR === 'true'
  ? JSON.parse(process.env.CHANGED_LINES_JSON || '{}')
  : undefined;
const evidence = generateCoverageEvidence(
  JSON.parse(await readFile(coveragePath, 'utf-8')),
  process.env.IS_PR === 'true',
  changedFiles,
  {
    changedLineRanges,
    metadata: {
      branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME,
      commit: process.env.GITHUB_SHA,
      base_branch: process.env.GITHUB_BASE_REF,
      pr_number: process.env.PR_NUMBER,
    },
  },
);
await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf-8');
const validation = validateCoverageEvidence(evidence);
console.log(`Coverage evidence written to ${evidencePath}`);
console.log(`Aggregate pass: ${evidence.aggregate_pass}`);
console.log(`Changed-scope pass: ${evidence.changed_scope_pass}`);
if (!validation.pass) {
  for (const error of validation.errors) console.error(error);
  process.exit(1);
}
NODE
