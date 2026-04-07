#!/usr/bin/env python3
"""AFR-005: Semantic warning marker check."""

import pathlib
import re
import sys


LEGAL_PREFIX = re.compile(
    r"^(\s*> \[!(?:WARNING|CAUTION|NOTE|TIP|INFO|DANGER)\]|\s*[⚠️🔴📌❗]\s*)"
)

WARNING_KEYWORDS = re.compile(
    r"\b(注意|WARNING|CAUTION|DANGER|IMPORTANT|千万别|不要在|切勿|do not|never|do NOT)\b",
    re.IGNORECASE,
)


def check_semantic_warnings(readme_path: str) -> list[str]:
    warnings = []
    content = pathlib.Path(readme_path).read_text()
    lines = content.split("\n")

    for index, line in enumerate(lines, 1):
        stripped = line.strip()
        if not stripped:
            continue
        if WARNING_KEYWORDS.search(stripped) and not LEGAL_PREFIX.match(line):
            if stripped.startswith("#"):
                continue
            if "|" in stripped and re.match(r"^\s*\|", stripped):
                continue
            warnings.append(f'Potential unstyled warning at line {index}: "{stripped[:60]}" — use \'> [!WARNING]\' or a warning prefix.')

    return warnings


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "README.md"
    for warning in check_semantic_warnings(path):
        print(f"WARNING: {warning}")
