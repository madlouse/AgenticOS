#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-root)
      PROJECT_ROOT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$PROJECT_ROOT" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

required_paths=(
  "README.md"
  "AGENTS.md"
  "CLAUDE.md"
  "CONTRIBUTING.md"
  "CHANGELOG.md"
  "ROADMAP.md"
  "LICENSE"
  ".gitignore"
  ".github/pull_request_template.md"
  ".github/ISSUE_TEMPLATE/bug_report.md"
  ".github/ISSUE_TEMPLATE/feature_request.md"
  ".github/ISSUE_TEMPLATE/config.yml"
  ".github/workflows/ci.yml"
  ".github/workflows/readme-lint.yml"
  ".github/workflows/release.yml"
  "scripts/readme-lint.sh"
  "scripts/_afr002.py"
  "scripts/_afr003.py"
  "scripts/_afr004.py"
  "scripts/_afr005.py"
  "scripts/_afr007.py"
  "tools/check-edit-boundary.sh"
  "tools/record-reminder.sh"
  "mcp-server/package.json"
  "homebrew-tap/Formula/agenticos.rb"
)

missing=()
for rel in "${required_paths[@]}"; do
  if [[ ! -e "$PROJECT_ROOT/$rel" ]]; then
    missing+=("$rel")
  fi
done

workflow_matches=()
while IFS= read -r line; do
  workflow_matches+=("$line")
done < <(rg -n "projects/agenticos|/Users/jeking/dev/AgenticOS|working-directory:\\s*projects/" \
  "$PROJECT_ROOT/.github" "$PROJECT_ROOT/scripts" 2>/dev/null || true)

status_required="PASS"
status_workflow="PASS"
if [[ ${#missing[@]} -gt 0 ]]; then
  status_required="BLOCK"
fi
if [[ ${#workflow_matches[@]} -gt 0 ]]; then
  status_workflow="BLOCK"
fi

overall="PASS"
if [[ "$status_required" != "PASS" || "$status_workflow" != "PASS" ]]; then
  overall="BLOCK"
fi

json_array() {
  local first=1
  printf "["
  for item in "$@"; do
    if [[ $first -eq 0 ]]; then
      printf ", "
    fi
    first=0
    printf "%s" "$(printf '%s' "$item" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
  done
  printf "]"
}

project_root_json="$(printf '%s' "$PROJECT_ROOT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
if [[ ${#missing[@]} -eq 0 ]]; then
  missing_json="[]"
else
  missing_json="$(json_array "${missing[@]}")"
fi
if [[ ${#workflow_matches[@]} -eq 0 ]]; then
  workflow_json="[]"
else
  workflow_json="$(json_array "${workflow_matches[@]}")"
fi

cat <<EOF
{
  "overall": "$overall",
  "project_root": $project_root_json,
  "checks": [
    {
      "id": "required-paths",
      "status": "$status_required",
      "summary": "future product-root shell files are present under the AgenticOS product project",
      "evidence": {
        "missing": $missing_json
      }
    },
    {
      "id": "root-path-assumptions",
      "status": "$status_workflow",
      "summary": "migrated workflows and scripts no longer assume the old workspace root layout",
      "evidence": {
        "matches": $workflow_json
      }
    }
  ]
}
EOF
