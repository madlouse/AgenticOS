#!/usr/bin/env python3
"""AFR-004: Tool name consistency check."""

import pathlib
import re
import sys


ALIAS_TABLE = {
    "Claude Code": ["claude-code", "claude code", "ClaudeCode"],
    "agenticos-mcp": ["AgenticOS", "agenticos"],
    "GitHub": ["Github"],
    "Node.js": ["Node.js", "NodeJS", "node"],
    "Homebrew": ["brew"],
    "npm": ["node package manager"],
}


def check_tool_consistency(readme_path: str) -> list[str]:
    warnings = []
    content = pathlib.Path(readme_path).read_text()

    for canonical, variants in ALIAS_TABLE.items():
        found_canonical = bool(re.search(r"\b" + re.escape(canonical) + r"\b", content))
        found_variants = [variant for variant in variants if re.search(r"\b" + re.escape(variant) + r"\b", content)]
        if found_canonical and found_variants:
            warnings.append(f"Canonical name '{canonical}' mixed with variants: {found_variants}. Use '{canonical}' consistently throughout.")

    return warnings


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "README.md"
    for warning in check_tool_consistency(path):
        print(f"WARNING: {warning}")
