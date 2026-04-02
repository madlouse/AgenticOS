#!/usr/bin/env python3
"""AFR-004: Tool name consistency check."""

import re
import sys
import pathlib


ALIAS_TABLE = {
    'Claude Code': ['claude-code', 'claude code', 'ClaudeCode'],
    'agenticos-mcp': ['AgenticOS', 'agenticos'],
    'GitHub': ['Github'],
    'Node.js': ['Node.js', 'NodeJS', 'node'],
    'Homebrew': ['brew'],
    'npm': ['node package manager'],
}


def check_tool_consistency(readme_path: str) -> list[str]:
    warnings = []
    content = pathlib.Path(readme_path).read_text()

    for canonical, variants in ALIAS_TABLE.items():
        found_canonical = bool(re.search(r'\b' + re.escape(canonical) + r'\b', content))
        found_variants = [v for v in variants if re.search(r'\b' + re.escape(v) + r'\b', content)]
        if found_canonical and found_variants:
            warnings.append(
                f"Canonical name '{canonical}' mixed with variants: {found_variants}. "
                f"Use '{canonical}' consistently throughout."
            )

    return warnings


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'README.md'
    for w in check_tool_consistency(path):
        print(f'WARNING: {w}')
