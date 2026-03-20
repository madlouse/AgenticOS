#!/bin/bash
# AgenticOS Recording Reminder Hook
# Runs on Claude Code "Stop" event. Checks if we're in an AgenticOS project
# and whether agenticos_record has been called recently. If not, reminds Agent.

# Find .project.yaml in current or parent dirs
find_project_dir() {
    local dir="$PWD"
    while [ "$dir" != "/" ]; do
        [ -f "$dir/.project.yaml" ] && echo "$dir" && return 0
        dir=$(dirname "$dir")
    done
    return 1
}

PROJECT_DIR=$(find_project_dir) || exit 0

MARKER="$PROJECT_DIR/.context/.last_record"

# If marker was touched in last 15 minutes, no reminder needed
if [ -f "$MARKER" ]; then
    NOW=$(date +%s)
    # macOS stat uses -f %m, Linux stat uses -c %Y
    MOD=$(stat -f %m "$MARKER" 2>/dev/null || stat -c %Y "$MARKER" 2>/dev/null)
    AGE=$(( NOW - MOD ))
    [ $AGE -lt 900 ] && exit 0
fi

PROJECT_NAME=$(basename "$PROJECT_DIR")
echo "🔔 AgenticOS: 当前在项目「${PROJECT_NAME}」中工作，还未记录会话。请在合适时机调用 agenticos_record 保存进展。"
