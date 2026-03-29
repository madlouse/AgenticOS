#!/bin/bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  check-edit-boundary.sh \
    --repo-path /abs/repo \
    --issue-id 113 \
    --declared-target-file path/to/file \
    [--declared-target-file other/file] \
    [--project-path /abs/project/root] \
    [--task-type implementation]

Environment:
  AGENTICOS_HOME             Required AgenticOS workspace root.
  AGENTICOS_MCP_COMMAND      Optional MCP command path. Default: agenticos-mcp
  AGENTICOS_MCP_ARGS_JSON    Optional JSON array of additional MCP command args.
EOF
}

REPO_PATH=""
PROJECT_PATH=""
ISSUE_ID=""
TASK_TYPE="implementation"
TARGET_FILES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-path)
      REPO_PATH="${2:-}"
      shift 2
      ;;
    --project-path)
      PROJECT_PATH="${2:-}"
      shift 2
      ;;
    --issue-id)
      ISSUE_ID="${2:-}"
      shift 2
      ;;
    --task-type)
      TASK_TYPE="${2:-}"
      shift 2
      ;;
    --declared-target-file)
      TARGET_FILES+=("${2:-}")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [[ -z "${AGENTICOS_HOME:-}" ]]; then
  echo "AGENTICOS_HOME is required." >&2
  exit 64
fi

if [[ -z "$REPO_PATH" || -z "$ISSUE_ID" || ${#TARGET_FILES[@]} -eq 0 ]]; then
  usage >&2
  exit 64
fi

TARGETS_JSON=$(printf '%s\n' "${TARGET_FILES[@]}" | node -e 'const fs=require("fs"); const lines=fs.readFileSync(0,"utf8").split("\n").filter(Boolean); process.stdout.write(JSON.stringify(lines));')

RESULT_JSON=$(
  REPO_PATH="$REPO_PATH" \
  PROJECT_PATH="$PROJECT_PATH" \
  ISSUE_ID="$ISSUE_ID" \
  TASK_TYPE="$TASK_TYPE" \
  TARGETS_JSON="$TARGETS_JSON" \
  node --input-type=module <<'NODE'
import { spawn } from 'child_process';

const command = process.env.AGENTICOS_MCP_COMMAND || 'agenticos-mcp';
const extraArgs = process.env.AGENTICOS_MCP_ARGS_JSON
  ? JSON.parse(process.env.AGENTICOS_MCP_ARGS_JSON)
  : [];

const server = spawn(command, extraArgs, {
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
let printed = false;

function finish(code) {
  server.kill();
  process.exit(code);
}

server.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id === 1) {
      server.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'agenticos_edit_guard',
          arguments: {
            issue_id: process.env.ISSUE_ID,
            task_type: process.env.TASK_TYPE,
            repo_path: process.env.REPO_PATH,
            project_path: process.env.PROJECT_PATH || undefined,
            declared_target_files: JSON.parse(process.env.TARGETS_JSON || '[]'),
          },
        },
      }) + '\n');
      continue;
    }
    if (msg.id === 2) {
      process.stdout.write(msg?.result?.content?.[0]?.text ?? JSON.stringify(msg));
      printed = true;
      finish(0);
    }
  }
});

server.stderr.on('data', (chunk) => process.stderr.write(chunk));
server.on('exit', (code) => {
  if (!printed) {
    process.exit(code ?? 1);
  }
});

server.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'agenticos-edit-guard', version: '1.0.0' },
  },
}) + '\n');

setTimeout(() => finish(1), 8000);
NODE
)

echo "$RESULT_JSON"

STATUS=$(printf '%s' "$RESULT_JSON" | node -e 'const fs=require("fs"); const obj=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(obj.status || "BLOCK");')
if [[ "$STATUS" != "PASS" ]]; then
  exit 2
fi
