#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_VERSION="v1"

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0
RECS=0
INFOS=0

log() { echo -e "${BLUE}[AFR]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*"; ERRORS=$((ERRORS+1)); }
warn() { echo -e "${YELLOW}[WARNING]${NC} $*"; WARNINGS=$((WARNINGS+1)); }
info() { echo -e "${GREEN}[INFO]${NC} $*"; INFOS=$((INFOS+1)); }
pass() { echo -e "${GREEN}[PASS]${NC} $*"; }
rec() { echo -e "${BLUE}[RECOMMENDATION]${NC} $*"; RECS=$((RECS+1)); }

check_first_line_h1() {
  local file="$1"
  local first_line
  first_line=$(head -1 "$file")
  if [[ "$first_line" != "# "* ]]; then
    err "AFR-001 $file:1 — First line must be a single H1 heading (found: '${first_line:0:60}')"
  else
    pass "AFR-001 $file — H1 heading confirmed"
  fi
}

check_has_h2() {
  local file="$1"
  if ! grep -qE '^## [^#]' "$file"; then
    err "AFR-001 $file — At least one H2 heading (##) is required"
  fi
}

check_heading_skip() {
  local file="$1"
  local first_h2_line
  local first_h3_line
  first_h2_line=$(grep -nE '^## [^#]' "$file" | head -1 | cut -d: -f1 || true)
  first_h3_line=$(grep -nE '^### ' "$file" | head -1 | cut -d: -f1 || true)
  if [[ -n "$first_h3_line" && -n "$first_h2_line" && "$first_h3_line" -lt "$first_h2_line" ]]; then
    err "AFR-001 $file:$first_h3_line — H3 heading appears before first H2 (H2 at line $first_h2_line)"
  fi
}

run_afr001() {
  local file="$1"
  log "Running AFR-001 (Heading Hierarchy)..."
  check_first_line_h1 "$file"
  check_has_h2 "$file"
  check_heading_skip "$file"
}

run_afr002() {
  local file="$1"
  log "Running AFR-002 (Installation Unambiguity)..."
  while IFS= read -r line; do
    if [[ "$line" == *"ERROR:"* ]]; then
      err "AFR-002 $file — ${line#*: }"
    elif [[ "$line" == *"WARNING:"* ]]; then
      warn "AFR-002 $file — ${line#*: }"
    fi
  done < <(python3 "${SCRIPT_DIR}/_afr002.py" "$file" 2>&1)
}

run_afr003() {
  local file="$1"
  log "Running AFR-003 (Code Fence Language)..."
  while IFS= read -r line; do
    warn "AFR-003 $file — ${line#*: }"
  done < <(python3 "${SCRIPT_DIR}/_afr003.py" "$file" 2>&1)
}

run_afr004() {
  local file="$1"
  log "Running AFR-004 (Tool Name Consistency)..."
  while IFS= read -r line; do
    warn "AFR-004 $file — ${line#*: }"
  done < <(python3 "${SCRIPT_DIR}/_afr004.py" "$file" 2>&1)
}

run_afr005() {
  local file="$1"
  log "Running AFR-005 (Semantic Warning Markers)..."
  while IFS= read -r line; do
    warn "AFR-005 $file — ${line#*: }"
  done < <(python3 "${SCRIPT_DIR}/_afr005.py" "$file" 2>&1)
}

run_afr006() {
  local file="$1"
  log "Running AFR-006 (AI Execution Entry)..."
  if grep -qiE '(?i)execute now|exec now|立即执行' "$file" 2>/dev/null; then
    pass "AFR-006 $file — EXECUTE NOW block found"
    return
  fi
  if grep -qE '\[.*install.*\]\(.*install.*\.md\)' "$file"; then
    pass "AFR-006 $file — install.md link found"
    return
  fi
  local qs_block
  qs_block=$(sed -n '/^## \(Quick Start\|Quickstart\|快速开始\|Quick start\)/,/^## /p' "$file" 2>/dev/null | sed '$d' || true)
  if [[ -n "$qs_block" ]] && echo "$qs_block" | grep -qE '^\s*\$ |^\s*(npm |brew |curl |git |pip )'; then
    pass "AFR-006 $file — Executable commands in Quick Start"
    return
  fi
  rec "AFR-006 $file — No clear AI-executable entry found. Add EXECUTE NOW or a Quick Start with runnable commands."
}

run_afr007() {
  local file="$1"
  log "Running AFR-007 (Link Integrity)..."
  while IFS= read -r line; do
    warn "AFR-007 $file — ${line#*: }"
  done < <(python3 "${SCRIPT_DIR}/_afr007.py" "$file" 2>&1)
}

run_afr008() {
  local file="$1"
  log "Running AFR-008 (Installation Single Source)..."
  if [[ -f "install.md" ]] || [[ -f "INSTALL.md" ]]; then
    local install_file="install.md"
    [[ -f "INSTALL.md" ]] && install_file="INSTALL.md"
    local readme_install_lines
    readme_install_lines=$(sed -n '/^## \(Installation\|安装\)/,/^## /p' "$file" 2>/dev/null | grep -c .) || readme_install_lines=0
    readme_install_lines=${readme_install_lines//[^0-9]/}
    if [[ -n "$readme_install_lines" && "$readme_install_lines" -gt 10 ]]; then
      warn "AFR-008 $file — ## Installation block has ${readme_install_lines} lines (>10) while $install_file exists. Reference $install_file instead."
    fi
    if ! grep -qE 'install\.md|INSTALL\.md' "$file" 2>/dev/null; then
      warn "AFR-008 $file — ## Installation exists but does not reference $install_file."
    fi
  fi
}

run_afr009() {
  local file="$1"
  log "Running AFR-009 (llms.txt Existence)..."
  local found=0
  for doc in llms.txt .github/llms.txt docs/ai-summary.md docs/llms.md AI_SUMMARY.md; do
    if [[ -f "$doc" ]]; then
      pass "AFR-009 $file — Found $doc"
      found=1
      break
    fi
  done
  if [[ "$found" -eq 0 ]]; then
    rec "AFR-009 $file — No dedicated AI documentation file found."
  fi
}

run_afr010() {
  local file="$1"
  log "Running AFR-010 (README Length)..."
  local lines
  lines=$(wc -l < "$file")
  if [[ "$lines" -gt 500 ]]; then
    info "AFR-010 $file — $lines lines (guideline: <= 500)"
  else
    pass "AFR-010 $file — $lines lines (within 500-line guideline)"
  fi
  local badge_count
  badge_count=$(head -20 "$file" | grep -cE '!\[.*\]\(.*\)' || true)
  badge_count=${badge_count//[^0-9]/}
  if [[ -n "$badge_count" && "$badge_count" -gt 5 ]]; then
    info "AFR-010 $file — First 20 lines contain $badge_count badges (>5, guideline: <=5)"
  fi
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS] [FILE...]

Options:
  --help           Show this help
  --version        Show version ($RULES_VERSION)
  --all            Lint all README.md files in repo (default)
  --rules RULES    Comma-separated rules to run (default: all)
  --errors-only    Only report ERROR-level findings

Arguments:
  FILE             README file(s) to lint. Defaults to README.md.
EOF
}

main() {
  local files=()
  local all=false
  local active_rules="1,2,3,4,5,6,7,8,9,10"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help) usage; exit 0 ;;
      --version) echo "AFR Lint $RULES_VERSION"; exit 0 ;;
      --all) all=true; shift ;;
      --rules) active_rules="$2"; shift 2 ;;
      -*) err "Unknown option: $1"; usage; exit 2 ;;
      *) files+=("$1"); shift ;;
    esac
  done

  if [[ ${#files[@]} -eq 0 ]]; then
    if [[ -f "README.md" ]]; then
      files=(README.md)
    else
      err "No README.md found. Specify a file or use --all."
      exit 2
    fi
  fi

  if $all; then
    mapfile -t discovered < <(find . -name "README.md" -not -path "./node_modules/*" -not -path "./.git/*" | sort)
    files=("${discovered[@]}")
  fi

  log "Linting ${#files[@]} file(s) with rules: $active_rules"
  for file in "${files[@]}"; do
    [[ -f "$file" ]] || { err "File not found: $file"; continue; }
    echo ""
    log "=== Linting: $file ==="
    for rule in $(echo "$active_rules" | tr ',' '\n'); do
      case "$rule" in
        1|AFR-001) run_afr001 "$file" ;;
        2|AFR-002) run_afr002 "$file" ;;
        3|AFR-003) run_afr003 "$file" ;;
        4|AFR-004) run_afr004 "$file" ;;
        5|AFR-005) run_afr005 "$file" ;;
        6|AFR-006) run_afr006 "$file" ;;
        7|AFR-007) run_afr007 "$file" ;;
        8|AFR-008) run_afr008 "$file" ;;
        9|AFR-009) run_afr009 "$file" ;;
        10|AFR-010) run_afr010 "$file" ;;
        *) warn "Unknown rule: $rule" ;;
      esac
    done
  done

  echo ""
  echo "========================================"
  echo -e "Summary: ${RED}$ERRORS ERROR${NC} ${YELLOW}$WARNINGS WARNING${NC} ${BLUE}$RECS RECOMMENDATION${NC} ${GREEN}$INFOS INFO${NC}"
  echo "========================================"
  if [[ $ERRORS -gt 0 ]]; then
    echo -e "${RED}FAILED${NC}: $ERRORS error(s) must be fixed."
    exit 1
  fi
  echo -e "${GREEN}PASSED${NC}: No ERROR-level issues."
}

main "$@"
