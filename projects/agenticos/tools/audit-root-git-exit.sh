#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  audit-root-git-exit.sh --workspace-root /abs/path [--product-project rel/path]

Options:
  --workspace-root   Candidate workspace-home root.
  --product-project  Product project path relative to workspace root.
                     Default: projects/agenticos

Behavior:
  - read-only audit
  - prints machine-readable JSON
  - exits 0 when no BLOCK checks exist
  - exits 1 when one or more BLOCK checks exist
EOF
}

WORKSPACE_ROOT=""
PRODUCT_PROJECT_REL="projects/agenticos"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace-root)
      WORKSPACE_ROOT="${2:-}"
      shift 2
      ;;
    --product-project)
      PRODUCT_PROJECT_REL="${2:-}"
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

if [[ -z "$WORKSPACE_ROOT" ]]; then
  usage >&2
  exit 64
fi

WORKSPACE_ROOT="$(cd "$WORKSPACE_ROOT" && pwd)"

WORKSPACE_ROOT="$WORKSPACE_ROOT" PRODUCT_PROJECT_REL="$PRODUCT_PROJECT_REL" node --input-type=module <<'NODE'
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

const workspaceRoot = resolve(process.env.WORKSPACE_ROOT);
const productProjectRel = process.env.PRODUCT_PROJECT_REL || 'projects/agenticos';
const productProjectPath = resolve(join(workspaceRoot, productProjectRel));

function run(command, args) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: '',
      stderr: String(error?.stderr || error?.message || error),
    };
  }
}

const checks = [];
const addCheck = (id, status, summary, evidence = {}) => {
  checks.push({ id, status, summary, evidence });
};

const gitRoot = run('git', ['-C', workspaceRoot, 'rev-parse', '--show-toplevel']);
if (!gitRoot.ok) {
  addCheck('root-git-root', 'PASS', 'workspace root is not currently a Git repository root', {
    workspace_root: workspaceRoot,
  });
} else if (gitRoot.stdout === workspaceRoot) {
  addCheck('root-git-root', 'BLOCK', 'workspace root is still the Git repository root', {
    workspace_root: workspaceRoot,
    git_root: gitRoot.stdout,
    dot_git_exists: existsSync(join(workspaceRoot, '.git')),
  });
} else {
  addCheck('root-git-root', 'WARN', 'workspace root sits inside a different Git repository root', {
    workspace_root: workspaceRoot,
    git_root: gitRoot.stdout,
  });
}

const tracked = run('git', ['-C', workspaceRoot, '-c', 'core.quotePath=false', 'ls-files']);
const trackedFiles = tracked.ok && tracked.stdout ? tracked.stdout.split('\n').filter(Boolean) : [];

const rootOwnedTopLevel = Array.from(new Set(
  trackedFiles
    .map((file) => file.split('/')[0])
    .filter((entry) => entry && entry !== 'projects'),
)).sort();

addCheck(
  'root-owned-top-level',
  rootOwnedTopLevel.length > 0 ? 'BLOCK' : 'PASS',
  rootOwnedTopLevel.length > 0
    ? 'tracked top-level entries outside projects/ still keep the workspace root acting like a product repository shell'
    : 'no tracked top-level product-owned entries remain outside projects/',
  { entries: rootOwnedTopLevel },
);

const siblingTrackedProjects = Array.from(new Set(
  trackedFiles
    .filter((file) => file.startsWith('projects/'))
    .map((file) => file.split('/').slice(0, 2).join('/'))
    .filter((projectRoot) => projectRoot !== productProjectRel),
)).sort();

addCheck(
  'tracked-sibling-projects',
  siblingTrackedProjects.length > 0 ? 'BLOCK' : 'PASS',
  siblingTrackedProjects.length > 0
    ? 'root Git still tracks sibling projects outside the intended product project'
    : 'root Git no longer tracks sibling projects outside the intended product project',
  { product_project: productProjectRel, sibling_projects: siblingTrackedProjects },
);

const status = run('git', ['-C', workspaceRoot, 'status', '--porcelain=v1']);
const dirtyLines = status.ok && status.stdout ? status.stdout.split('\n').filter(Boolean) : [];
const runtimeDirtyPatterns = [
  /^.. \.agent-workspace\//,
  /^.. .*\.context\//,
  /^.. .*\.last_record$/,
];
const runtimeDirty = dirtyLines.filter((line) => runtimeDirtyPatterns.some((pattern) => pattern.test(line)));

addCheck(
  'runtime-dirtiness',
  runtimeDirty.length > 0 ? 'BLOCK' : 'PASS',
  runtimeDirty.length > 0
    ? 'runtime state is still dirty inside the current root Git checkout'
    : 'no runtime-state dirtiness detected in the current root Git checkout',
  { dirty_entries: runtimeDirty },
);

const compatibilityShims = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'ROADMAP.md',
  '.github',
  'mcp-server',
  'scripts',
  'tools',
];
const presentCompatibilityShims = compatibilityShims.filter((entry) => trackedFiles.some((file) => file === entry || file.startsWith(`${entry}/`)));

addCheck(
  'compatibility-shims',
  presentCompatibilityShims.length > 0 ? 'WARN' : 'PASS',
  presentCompatibilityShims.length > 0
    ? 'root compatibility or automation surfaces still exist and must be migrated or retired before final root-git exit'
    : 'no known root compatibility shims remain',
  { entries: presentCompatibilityShims },
);

const overall = checks.some((check) => check.status === 'BLOCK')
  ? 'BLOCK'
  : checks.some((check) => check.status === 'WARN')
    ? 'WARN'
    : 'PASS';

console.log(JSON.stringify({
  overall,
  workspace_root: workspaceRoot,
  product_project: productProjectRel,
  checks,
}, null, 2));

process.exit(overall === 'BLOCK' ? 1 : 0);
NODE
