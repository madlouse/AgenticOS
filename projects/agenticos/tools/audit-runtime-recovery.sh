#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  audit-runtime-recovery.sh --source-root /abs/path [--expected-home /abs/path]

Options:
  --source-root    AgenticOS source checkout or intended workspace root.
  --expected-home  Optional path that local configs are expected to target.

Behavior:
  - read-only audit
  - prints machine-readable JSON
  - exits 0 when no BLOCK checks exist
  - exits 1 when one or more BLOCK checks exist
EOF
}

SOURCE_ROOT=""
EXPECTED_HOME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-root)
      SOURCE_ROOT="${2:-}"
      shift 2
      ;;
    --expected-home)
      EXPECTED_HOME="${2:-}"
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

if [[ -z "$SOURCE_ROOT" ]]; then
  usage >&2
  exit 64
fi

SOURCE_ROOT="$(cd "$SOURCE_ROOT" && pwd)"
if [[ -n "$EXPECTED_HOME" ]]; then
  EXPECTED_HOME="$(cd "$EXPECTED_HOME" && pwd)"
fi

SOURCE_ROOT="$SOURCE_ROOT" EXPECTED_HOME="$EXPECTED_HOME" node --input-type=module <<'NODE'
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const sourceRoot = resolve(process.env.SOURCE_ROOT);
const expectedHome = process.env.EXPECTED_HOME ? resolve(process.env.EXPECTED_HOME) : null;

const checks = [];

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

function addCheck(id, status, summary, evidence = {}) {
  checks.push({ id, status, summary, evidence });
}

function readIfExists(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

function extractConfiguredHome(content) {
  if (!content) return [];

  const matches = new Set();
  const patterns = [
    /AGENTICOS_HOME["'\s:=]+([^"'\n\r]+)/g,
    /AGENTICOS_HOME\s*=\s*["']([^"']+)["']/g,
    /AGENTICOS_HOME\s*=\s*([^\s,"'}]+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      matches.add(raw.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, ''));
    }
  }

  return Array.from(matches);
}

const configFiles = [
  `${process.env.HOME}/.codex/config.toml`,
  `${process.env.HOME}/.cursor/mcp.json`,
  `${process.env.HOME}/.claude/settings.json`,
  `${process.env.HOME}/.zshrc`,
];

const configResults = configFiles.map((file) => {
  const content = readIfExists(file);
  const values = extractConfiguredHome(content);
  return { file, exists: content !== null, values };
});

const configuredHomes = new Set(
  configResults.flatMap((result) => result.values).map((value) => resolve(value)),
);

if (configuredHomes.size === 0) {
  addCheck(
    'config-agenticos-home',
    'WARN',
    'no explicit AGENTICOS_HOME bindings were found in the audited local config files',
    { files: configResults },
  );
} else if (configuredHomes.size > 1) {
  addCheck(
    'config-agenticos-home',
    'BLOCK',
    'multiple AGENTICOS_HOME values are configured across local surfaces',
    { files: configResults, configured_homes: Array.from(configuredHomes) },
  );
} else {
  const configuredHome = Array.from(configuredHomes)[0];
  const status = expectedHome && configuredHome !== expectedHome ? 'BLOCK' : 'PASS';
  addCheck(
    'config-agenticos-home',
    status,
    status === 'PASS'
      ? 'all audited local config surfaces agree on one AGENTICOS_HOME value'
      : 'audited local config surfaces point at a different AGENTICOS_HOME than the expected target',
    { files: configResults, configured_home: configuredHome, expected_home: expectedHome },
  );
}

const launchctl = run('launchctl', ['getenv', 'AGENTICOS_HOME']);
if (!launchctl.ok || !launchctl.stdout) {
  addCheck('launchctl-agenticos-home', 'WARN', 'launchctl does not expose AGENTICOS_HOME', {
    stderr: launchctl.stderr || null,
  });
} else {
  const launchctlHome = resolve(launchctl.stdout);
  const status = expectedHome && launchctlHome !== expectedHome ? 'BLOCK' : 'PASS';
  addCheck(
    'launchctl-agenticos-home',
    status,
    status === 'PASS'
      ? 'launchctl AGENTICOS_HOME matches the expected target'
      : 'launchctl AGENTICOS_HOME does not match the expected target',
    { launchctl_home: launchctlHome, expected_home: expectedHome },
  );
}

const gitRoot = run('git', ['-C', sourceRoot, 'rev-parse', '--show-toplevel']);
if (gitRoot.ok && gitRoot.stdout === sourceRoot) {
  if (expectedHome && expectedHome === sourceRoot) {
    addCheck(
      'source-root-git-role',
      'BLOCK',
      'the expected workspace home is the same path as a Git repository root, so it is not yet a safe final workspace home',
      { source_root: sourceRoot, expected_home: expectedHome },
    );
  } else {
    addCheck(
      'source-root-git-role',
      'PASS',
      'the source root is a Git repository root, but the expected workspace home is separate so source pollution is avoidable',
      { source_root: sourceRoot, expected_home: expectedHome },
    );
  }
} else if (gitRoot.ok) {
  addCheck(
    'source-root-git-role',
    'WARN',
    'the target path is inside a Git repository but is not itself the repository root',
    { source_root: sourceRoot, git_root: gitRoot.stdout },
  );
} else {
  addCheck(
    'source-root-git-role',
    'PASS',
    'the target path is not currently acting as a Git repository root',
    { source_root: sourceRoot },
  );
}

const agenticosWhich = run('which', ['agenticos-mcp']);
if (!agenticosWhich.ok || !agenticosWhich.stdout) {
  addCheck('installed-runtime', 'BLOCK', 'agenticos-mcp is not available on PATH');
} else {
  const brewPrefix = run('brew', ['--prefix', 'agenticos']);
  const libexecRoot = brewPrefix.ok ? `${brewPrefix.stdout}/libexec/lib/node_modules/agenticos-mcp` : null;
  const guardPath = libexecRoot ? `${libexecRoot}/build/utils/canonical-main-guard.js` : null;
  const guardExists = guardPath ? existsSync(guardPath) : false;

  addCheck(
    'installed-runtime',
    guardExists ? 'PASS' : 'BLOCK',
    guardExists
      ? 'installed runtime contains canonical-main runtime write protection'
      : 'installed runtime does not contain canonical-main runtime write protection',
    {
      agenticos_mcp_path: agenticosWhich.stdout,
      brew_prefix: brewPrefix.ok ? brewPrefix.stdout : null,
      guard_path: guardPath,
      guard_exists: guardExists,
    },
  );
}

const tapFormulaSearch = run('sh', ['-lc', "find /opt/homebrew/Library/Taps -path '*/Formula/agenticos.rb' -print 2>/dev/null | sort"]);
const formulaPaths = tapFormulaSearch.ok && tapFormulaSearch.stdout
  ? tapFormulaSearch.stdout.split('\n').filter(Boolean)
  : [];

if (formulaPaths.length <= 1) {
  addCheck(
    'formula-source-ambiguity',
    'PASS',
    'only one local Homebrew formula path was found for agenticos',
    { formula_paths: formulaPaths },
  );
} else {
  addCheck(
    'formula-source-ambiguity',
    'BLOCK',
    'multiple local Homebrew formula paths were found for agenticos',
    { formula_paths: formulaPaths },
  );
}

const overall = checks.some((check) => check.status === 'BLOCK')
  ? 'BLOCK'
  : checks.some((check) => check.status === 'WARN')
    ? 'WARN'
    : 'PASS';

const result = {
  overall,
  source_root: sourceRoot,
  expected_home: expectedHome,
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(overall === 'BLOCK' ? 1 : 0);
NODE
