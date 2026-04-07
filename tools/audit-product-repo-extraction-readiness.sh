#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT=""
PRODUCT_ROOT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace-root)
      WORKSPACE_ROOT="$2"
      shift 2
      ;;
    --product-root)
      PRODUCT_ROOT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_PRODUCT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -z "$PRODUCT_ROOT" ]]; then
  PRODUCT_ROOT="$DEFAULT_PRODUCT_ROOT"
fi
if [[ -z "$WORKSPACE_ROOT" ]]; then
  WORKSPACE_ROOT="$(cd "$PRODUCT_ROOT/../.." && pwd)"
fi

product_shell_script="$PRODUCT_ROOT/tools/audit-product-root-shell.sh"
root_git_script="$PRODUCT_ROOT/tools/audit-root-git-exit.sh"

if [[ ! -x "$product_shell_script" ]]; then
  echo "{\"overall\":\"BLOCK\",\"reason\":\"missing executable $product_shell_script\"}"
  exit 1
fi
if [[ ! -x "$root_git_script" ]]; then
  echo "{\"overall\":\"BLOCK\",\"reason\":\"missing executable $root_git_script\"}"
  exit 1
fi

product_shell_json="$("$product_shell_script" --project-root "$PRODUCT_ROOT" || true)"
root_git_json="$("$root_git_script" --workspace-root "$WORKSPACE_ROOT" || true)"

product_shell_overall="$(printf '%s' "$product_shell_json" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["overall"])')"
tracked_sibling_status="$(printf '%s' "$root_git_json" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(next(c["status"] for c in data["checks"] if c["id"] == "tracked-sibling-projects"))')"
runtime_dirtiness_status="$(printf '%s' "$root_git_json" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(next(c["status"] for c in data["checks"] if c["id"] == "runtime-dirtiness"))')"

origin_url="$(git -C "$WORKSPACE_ROOT" remote get-url origin 2>/dev/null || true)"
origin_url_redacted="$(printf '%s' "$origin_url" | sed -E 's#(https?://)[^@]+@#\1***@#')"
remote_status="PASS"
if [[ -z "$origin_url" ]]; then
  remote_status="BLOCK"
fi

overall="PASS"
if [[ "$product_shell_overall" != "PASS" || "$tracked_sibling_status" != "PASS" || "$runtime_dirtiness_status" != "PASS" || "$remote_status" != "PASS" ]]; then
  overall="BLOCK"
fi

workspace_root_json="$(printf '%s' "$WORKSPACE_ROOT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
product_root_json="$(printf '%s' "$PRODUCT_ROOT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
origin_url_json="$(printf '%s' "$origin_url_redacted" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"

cat <<EOF
{
  "overall": "$overall",
  "workspace_root": $workspace_root_json,
  "product_root": $product_root_json,
  "checks": [
    {
      "id": "product-root-shell",
      "status": "$product_shell_overall",
      "summary": "projects/agenticos carries the minimum future repo-root shell",
      "evidence": $product_shell_json
    },
    {
      "id": "sibling-project-extraction",
      "status": "$tracked_sibling_status",
      "summary": "workspace root no longer tracks sibling projects outside projects/agenticos",
      "evidence": {
        "source": "audit-root-git-exit"
      }
    },
    {
      "id": "workspace-runtime-clean",
      "status": "$runtime_dirtiness_status",
      "summary": "workspace root is clean enough to execute a Git-root extraction safely",
      "evidence": {
        "source": "audit-root-git-exit"
      }
    },
    {
      "id": "remote-defined",
      "status": "$remote_status",
      "summary": "workspace Git remote is defined so the split migration can prove and hand off remote ownership explicitly",
      "evidence": {
        "origin_url": $origin_url_json
      }
    }
  ]
}
EOF
