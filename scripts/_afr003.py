#!/usr/bin/env python3
"""AFR-003: Code fence language identifier check."""

import re
import sys
import pathlib


def check_code_fence_language(readme_path: str) -> list[str]:
    warnings = []
    content = pathlib.Path(readme_path).read_text()
    lines = content.split('\n')

    in_fence = False
    fence_start_line = 0

    for i, line in enumerate(lines, 1):
        if re.match(r'^```\s*$', line):
            if not in_fence:
                in_fence = True
                fence_start_line = i
            else:
                in_fence = False
        elif in_fence:
            stripped = line.strip()
            if stripped and not re.match(r'^```', stripped):
                # Blank lines are OK inside code blocks
                warnings.append(
                    f'Code fence at line {fence_start_line} has no language identifier. '
                    f'First content: "{stripped[:50]}"'
                )
                in_fence = False

    return warnings


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'README.md'
    for w in check_code_fence_language(path):
        print(f'WARNING: {w}')
