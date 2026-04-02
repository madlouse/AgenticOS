#!/usr/bin/env python3
"""AFR-002: Installation command disambiguation check."""

import re
import sys
import pathlib


def check_install_unambiguity(readme_path: str) -> list[tuple[str, str]]:
    """Returns list of (level, message) tuples."""
    messages = []
    content = pathlib.Path(readme_path).read_text()
    lines = content.split('\n')

    # Find ## Installation or ## Quick Start block
    in_block = False
    block_start = 0
    install_lines = []

    for i, line in enumerate(lines):
        if re.match(r'^## (Installation|Quick Start|Quickstart|安装|快速开始)', line, re.IGNORECASE):
            in_block = True
            block_start = i
            install_lines.append(line)
        elif in_block:
            if re.match(r'^## ', line):
                break
            install_lines.append(line)

    block_text = '\n'.join(install_lines)
    preamble = '\n'.join(lines[max(0, block_start - 10):block_start])
    combined = preamble + '\n' + block_text

    # Test 1: JS package manager without Node.js version constraint → ERROR
    js_found = re.findall(r'\b(npm|yarn|pnpm)\s+(install|add)', block_text)
    if js_found:
        if not re.search(r'node[.]js\s*[><=]+\s*[\d.]+|node\s+--version', combined):
            messages.append(('ERROR',
                'JavaScript package manager found in ## Installation without Node.js version constraint. '
                'Add a line like: Requires: Node.js >= 18.0.0'))

    # Test 2: pip without version constraint → WARNING
    pip_found = re.findall(r'\bpip3?\s+install', block_text)
    if pip_found and not re.search(r'pip install\s+[\'"]?[a-zA-Z][\w-]+[=><][\d.]+', block_text):
        messages.append(('WARNING',
            'pip install found without explicit version constraint. Add e.g. pip install package==1.0.0'))

    # Test 3: No verification command in install block → ERROR
    ver_patterns = [
        r'\$?\s*\w+[\w-]*\s+--version',
        r'\$?\s*\w+[\w-]*\s+-v\b',
        r'\bverify\b',
        r'\b验证\b',
        r'#\s*(verify|验证)\b',
        r'should output',
        r'应输出',
        r'#\s+Verify\b',
        r'#\s+验证\b',
    ]
    has_verification = any(re.search(p, block_text, re.IGNORECASE) for p in ver_patterns)
    if not has_verification and install_lines:
        messages.append(('ERROR',
            'No verification command found in ## Installation block. '
            'Add a step like: `program --version` or `# Verify: should output X`'))

    # Test 4: Multiple package managers without disambiguation → WARNING
    pm_count = sum([
        bool(re.search(r'\bnpm\b', block_text)),
        bool(re.search(r'\byarn\b', block_text)),
        bool(re.search(r'\bpnpm\b', block_text)),
        bool(re.search(r'\bbrew\b.*install', block_text, re.IGNORECASE)),
    ])
    if pm_count >= 2:
        disambig = [
            r'\b(recommended|preferred|推荐)\b',
            r'\b(macOS|Linux|Windows)\b',
            r'\b(choose|pick|选一)\b',
        ]
        if not any(re.search(p, block_text, re.IGNORECASE) for p in disambig):
            messages.append(('WARNING',
                f'{pm_count} package managers found without disambiguation. '
                'Add (recommended), (macOS), or (choose one) to each.'))

    return messages


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'README.md'
    for level, msg in check_install_unambiguity(path):
        print(f'{level}: {msg}')
