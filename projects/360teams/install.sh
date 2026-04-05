#!/usr/bin/env bash
# install.sh — manual install for development / non-Homebrew use
#
# Usage:
#   ./install.sh            # install from current repo
#   ./install.sh --uninstall
set -euo pipefail

ADAPTER_SRC="$(cd "$(dirname "$0")/clis/360teams" && pwd)"
SKILLS_SRC="$(cd "$(dirname "$0")/skills" && pwd)"
OPENCLI_CLIS_DIR="$HOME/.opencli/clis"
SKILL_PARENT="$HOME/.claude/skills"
ADAPTER_LINK="$OPENCLI_CLIS_DIR/360teams"

uninstall() {
  echo "Uninstalling 360teams opencli adapter and skills..."
  [ -L "$ADAPTER_LINK" ] && rm -f "$ADAPTER_LINK" && echo "  removed $ADAPTER_LINK"
  [ -d "$SKILL_PARENT/360teams" ] && rm -rf "$SKILL_PARENT/360teams" && echo "  removed $SKILL_PARENT/360teams"
  [ -d "$SKILL_PARENT/navigate" ] && rm -rf "$SKILL_PARENT/navigate" && echo "  removed $SKILL_PARENT/navigate"
  [ -d "$SKILL_PARENT/t5t" ] && rm -rf "$SKILL_PARENT/t5t" && echo "  removed $SKILL_PARENT/t5t"
  [ -d "$SKILL_PARENT/okr-ops" ] && rm -rf "$SKILL_PARENT/okr-ops" && echo "  removed $SKILL_PARENT/okr-ops"
  echo "Done."
  exit 0
}

[ "${1:-}" = "--uninstall" ] && uninstall

echo "Installing 360Teams opencli adapter and skills..."

# Runtime dependencies
echo "→ Installing dependencies..."
(cd "$ADAPTER_SRC" && npm install --production --silent)

# opencli adapter symlink
mkdir -p "$OPENCLI_CLIS_DIR"
if [ -L "$ADAPTER_LINK" ] || [ -e "$ADAPTER_LINK" ]; then
  rm -rf "$ADAPTER_LINK"
fi
ln -sf "$ADAPTER_SRC" "$ADAPTER_LINK"
echo "→ Adapter: $ADAPTER_LINK → $ADAPTER_SRC"

# Claude Code skills: 360teams (SKILL.md file) + navigate/t5t/okr-ops (dirs)
# 360teams: single file -> ~/.claude/skills/360teams/SKILL.md
if [ -f "$SKILLS_SRC/SKILL.md" ]; then
  mkdir -p "$SKILL_PARENT/360teams"
  cp "$SKILLS_SRC/SKILL.md" "$SKILL_PARENT/360teams/SKILL.md"
  echo "→ Skill:   $SKILL_PARENT/360teams/"
fi

# navigate, t5t, okr-ops: directory trees
for skill in navigate t5t okr-ops; do
  src="$SKILLS_SRC/$skill"
  dest="$SKILL_PARENT/$skill"
  if [ -d "$src" ]; then
    mkdir -p "$dest"
    find "$src" -type f | while read -r f; do
      rel="${f#$src/}"
      mkdir -p "$(dirname "$dest/$rel")"
      cp "$f" "$dest/$rel"
    done
    echo "→ Skill:   $dest/"
  fi
done

echo ""
echo "✓ Done. 360Teams will auto-launch in debug mode when you use the skill."
echo "  Run 'opencli 360teams status' to verify."
