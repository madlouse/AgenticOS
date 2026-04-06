#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: $0 <source_root> <workspace_root> [project_id]" >&2
  exit 2
fi

SOURCE_ROOT="$(cd "$1" && pwd)"
WORKSPACE_ROOT="$(cd "$2" && pwd)"
PROJECT_ID="${3:-agent-cli-api}"

if [[ "$WORKSPACE_ROOT" == "$SOURCE_ROOT" || "$WORKSPACE_ROOT" == "$SOURCE_ROOT"/* ]]; then
  echo "FAIL workspace root is inside source checkout" >&2
  exit 1
fi

if [[ ! -f "$WORKSPACE_ROOT/.agent-workspace/registry.yaml" ]]; then
  echo "FAIL missing workspace registry at $WORKSPACE_ROOT/.agent-workspace/registry.yaml" >&2
  exit 1
fi

if [[ ! -d "$WORKSPACE_ROOT/projects" ]]; then
  echo "FAIL missing workspace projects directory at $WORKSPACE_ROOT/projects" >&2
  exit 1
fi

check_config_path() {
  local file="$1"
  if [[ -f "$file" ]]; then
    if grep -Eq "AGENTICOS_HOME[\"[:space:]=:]*${SOURCE_ROOT//\//\\/}" "$file"; then
      echo "FAIL AGENTICOS_HOME still points at source checkout: $file" >&2
      exit 1
    fi
    if ! grep -Eq "AGENTICOS_HOME[\"[:space:]=:]*${WORKSPACE_ROOT//\//\\/}" "$file"; then
      echo "FAIL AGENTICOS_HOME does not point at workspace root: $file" >&2
      exit 1
    fi
  fi
}

check_config_path "$HOME/.codex/config.toml"
check_config_path "$HOME/.cursor/mcp.json"
check_config_path "$HOME/.claude/settings.json"

STATUS_BEFORE="$(git -C "$SOURCE_ROOT" status --short)"

WORKSPACE_ROOT="$WORKSPACE_ROOT" PROJECT_ID="$PROJECT_ID" node --input-type=module <<'NODE'
import { spawn } from 'child_process';

const workspaceRoot = process.env.WORKSPACE_ROOT;
const projectId = process.env.PROJECT_ID;

if (!workspaceRoot || !projectId) {
  console.error('missing WORKSPACE_ROOT or PROJECT_ID');
  process.exit(1);
}

const server = spawn('agenticos-mcp', [], {
  env: { ...process.env, AGENTICOS_HOME: workspaceRoot },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
let finished = false;

const fail = (message) => {
  if (finished) return;
  finished = true;
  console.error(message);
  server.kill();
  process.exit(1);
};

const sendTool = (id, name, args = {}) => {
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  }) + '\n');
};

server.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let newlineIndex;
  while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (!line) continue;

    const msg = JSON.parse(line);
    if (msg.id === 1) {
      sendTool(2, 'agenticos_list');
      continue;
    }

    if (msg.id === 2) {
      const text = msg?.result?.content?.[0]?.text ?? '';
      if (!text.includes(projectId)) {
        fail(`agenticos_list did not include ${projectId}`);
      }
      sendTool(3, 'agenticos_switch', { project: projectId });
      continue;
    }

    if (msg.id === 3) {
      const text = msg?.result?.content?.[0]?.text ?? '';
      if (!text.includes('Switched to project')) {
        fail(`agenticos_switch failed: ${text}`);
      }
      sendTool(4, 'agenticos_status');
      continue;
    }

    if (msg.id === 4) {
      const text = msg?.result?.content?.[0]?.text ?? '';
      if (!text || text.includes('Failed to read state.yaml')) {
        fail(`agenticos_status failed: ${text}`);
      }
      finished = true;
      console.log(text);
      server.kill();
      process.exit(0);
    }
  }
});

server.stderr.on('data', (chunk) => process.stderr.write(chunk));

server.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'workspace-separation-check',
      version: '1.0.0',
    },
  },
}) + '\n');

setTimeout(() => fail('timed out waiting for agenticos-mcp responses'), 15000);
NODE

STATUS_AFTER="$(git -C "$SOURCE_ROOT" status --short)"

if [[ "$STATUS_BEFORE" != "$STATUS_AFTER" ]]; then
  echo "FAIL source checkout dirtiness changed during workspace verification" >&2
  echo "--- before" >&2
  printf '%s\n' "$STATUS_BEFORE" >&2
  echo "--- after" >&2
  printf '%s\n' "$STATUS_AFTER" >&2
  exit 1
fi

echo "OK workspace separation verified"
