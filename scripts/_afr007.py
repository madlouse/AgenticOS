#!/usr/bin/env python3
"""AFR-007: Link integrity check (relative .md links and local images)."""

import re
import sys
import pathlib


def check_link_integrity(readme_path: str) -> list[str]:
    warnings = []
    readme_dir = pathlib.Path(readme_path).parent
    content = pathlib.Path(readme_path).read_text()

    # Relative .md links
    md_links = re.findall(r'\[([^\]]+)\]\(([^)]+\.md)\)', content)
    for label, link in md_links:
        if link.startswith('#') or link.startswith('http'):
            continue
        link_file = link.split('#')[0]
        target = readme_dir / link_file
        if not target.exists():
            warnings.append(
                f"Linked file not found: '{link}' (label: '{label}', "
                f"resolved: {target})"
            )

    # Local images
    img_links = re.findall(r'!\[([^\]]*)\]\(([^)]+\.(?:png|jpg|gif|svg|webp))\)', content)
    for label, link in img_links:
        if link.startswith('http'):
            continue
        target = readme_dir / link
        if not target.exists():
            warnings.append(
                f"Linked image not found: '{link}' (resolved: {target})"
            )

    return warnings


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'README.md'
    for w in check_link_integrity(path):
        print(f'WARNING: {w}')
