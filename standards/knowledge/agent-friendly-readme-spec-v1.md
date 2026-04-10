# Agent-Friendly README 规范 v1.0

> 版本：1.0.0
> 状态：canonical
> 上游：agent-friendly-readme-research-2026-04-02.md
> 适用范围：所有 AgenticOS 下游项目的 README.md 及相关核心文档

---

## 1. 规范目标与范围

### 1.1 目标

为 AgenticOS 项目定义一套 README 编写规范，使 AI Agent 能够：

- **理解**：准确理解项目定位、架构和功能边界
- **执行**：无歧义地执行安装和验证步骤
- **导航**：可靠定位所需的功能描述和参考文档

### 1.2 适用范围

| 文件 | 说明 | 规范要求 |
|------|------|---------|
| `README.md` | 项目主入口文档 | 全部 10 条 AFR 规则 |
| `install.md` / `INSTALL.md` | 独立安装步骤文档 | install.md 9 要素格式（推荐） |
| `CONTRIBUTING.md` | 贡献指南 | 参照执行（AFR-001/003/005 强制） |

### 1.3 非适用范围

| 文件 | 说明 | 原因 |
|------|------|------|
| `AGENTS.md` | Agent 专用工作规范 | 另有独立规范体系 |
| `CLAUDE.md` | Claude Code 上下文注入 | 另有独立规范体系 |
| `CHANGELOG.md` | 变更日志 | 另有格式规范 |
| `docs/` 子目录 | 深度技术文档 | 不属于核心项目文档 |

### 1.4 术语表

| 术语 | 定义 |
|------|------|
| Agentic Documentation | 明确为 AI 代理撰写、可直接执行的文档 |
| Agent-Friendly Documentation | 为人类撰写但经优化使 AI 准确理解的文档 |
| AFR | Agent-Friendly README，AFR-XXX 为规则编号 |
| 严重级别 ERROR | 违反此规则会导致 AI 无法完成核心任务，必须修复 |
| 严重级别 WARNING | 可能导致 AI 误解或低效执行，建议修复 |
| 严重级别 RECOMMENDATION | 最佳实践，不影响基本功能 |
| 严重级别 INFO | 提示性建议，无约束力 |
| Bold+em-dash 格式 | `**[Name]** — 一句话描述` |

---

## 2. 文档结构模板

### 2.1 强制节（必须全部存在，顺序固定）

```markdown
# Project Name

> 一句话项目描述（80 字以内）。描述应包含：这是什么、解决什么问题、适合谁。

## Quick Start

<!-- 包含：OBJECTIVE / DONE WHEN / TODO 清单 / 编号步骤 / EXECUTE NOW -->
<!-- 命令必须包含：包管理器 + 版本约束（如适用）+ 验证命令 -->

## Installation

<!-- 详细安装步骤，包含版本约束和前置条件 -->
<!-- 如果 install.md 存在：简短的 README 引用 + 指向 install.md -->

## Usage

<!-- 基本使用示例，代码块必须带语言标识 -->
<!-- 包含最常见的 2-3 个用例 -->

## Architecture

<!-- 高层描述，使用 Bold+em-dash 一致性格式 -->
<!-- 可选：Mermaid 或 ASCII 图表 -->
<!-- 必须：组件边界和依赖关系说明 -->

## API Reference

<!-- 一致性格式的工具/API 描述 -->
<!-- 参数、返回值、警告使用 markdown-alert -->

## Contributing

<!-- 简短引用，指向完整 CONTRIBUTING.md -->

## License
```

### 2.2 可选节

| 节名 | 要求 | 说明 |
|------|------|------|
| Badges | ≤5 个，放底部或 Quick Start 之后 | 超出的徽章移至底部 |
| Table of Contents | 大型项目（>300 行）推荐 | 使用 `[TOC]` 或手动锚点 |
| Background / Motivation | 小型项目可选 | 大型项目推荐移到 docs/ |
| Roadmap | 可选 | 推荐链接到 ROADMAP.md |
| Security | 安全敏感项目必须 | 引用 SECURITY.md |

### 2.3 install.md 独立文件格式（推荐用于复杂安装场景）

如果 `install.md` 作为独立文件存在，README.md 的 ## Installation 节应仅包含引用：

```markdown
## Installation

See [INSTALL.md](./INSTALL.md) for detailed platform-specific instructions.
```

`install.md` 内部使用完整格式：

```markdown
# agenticos-mcp

> I want you to install agenticos-mcp for me. Execute all the steps below autonomously.

**OBJECTIVE**: Install and verify the agenticos-mcp binary.

**DONE WHEN**: `agenticos-list` outputs a project list (empty is fine).

- [ ] Check prerequisites
- [ ] Install via Homebrew (recommended)
- [ ] Verify installation
- [ ] Configure MCP

### Step 1: Check Prerequisites
Node.js >= 18.0.0:
node --version

### Step 2: Install via Homebrew
brew tap madlouse/agenticos && brew install agenticos

### Step 3: Verify
agenticos-list

<!-- EXECUTE NOW: Complete the above TODO list -->
```

---

## 3. AFR 规则体系（10 条）

---

### AFR-001：标题层级完整性

**严重级别**：ERROR

**规则描述**：README.md 必须以单个一级标题（`#`）开头，且至少包含一个二级标题（`##`），不允许跳级（如 `###` 出现在首个 `##` 之前）。

**触发条件**：以下任一情况触发：
1. 第一行不是 `# ` 开头
2. 全文不存在 `## ` 标题
3. 存在 `### ` 且其行号小于首个 `## ` 的行号

**检验逻辑**（bash）：

```bash
#!/usr/bin/env bash
# AFR-001: Heading hierarchy integrity check

check_heading_hierarchy() {
  local readme="${1:-README.md}"
  local errors=0

  # Test 1: First line must be H1
  local first_line
  first_line=$(head -1 "$readme")
  if [[ "$first_line" != "# "* ]]; then
    echo "::error file=$readme::AFR-001 ERROR: First line must be a single H1 heading (found: '$first_line')"
    ((errors++))
  fi

  # Test 2: Must contain at least one H2
  if ! grep -qE '^## [^#]' "$readme"; then
    echo "::error file=$readme::AFR-001 ERROR: README must contain at least one H2 heading (##)"
    ((errors++))
  fi

  # Test 3: No H3 before first H2
  local first_h2_line
  first_h2_line=$(grep -nE '^## [^#]' "$readme" | head -1 | cut -d: -f1)
  local first_h3_line
  first_h3_line=$(grep -nE '^### ' "$readme" | head -1 | cut -d: -f1)

  if [[ -n "$first_h3_line" && -n "$first_h2_line" && "$first_h3_line" -lt "$first_h2_line" ]]; then
    echo "::error file=$readme::AFR-001 ERROR: H3 heading (line $first_h3_line) appears before first H2 (line $first_h2_line)"
    ((errors++))
  fi

  return $errors
}

check_heading_hierarchy "$@"
```

**正面示例**：
```markdown
# AgenticOS

> AI-native project management system.

## Quick Start
### Prerequisites
## Installation
```

**反面示例**：
```markdown
<!-- 第一行为图片或徽章 -->
[![Build](...)](...)

### Quick Start    <!-- 错误：H3 在任何 H2 之前 -->
```

---

### AFR-002：安装命令无歧义

**严重级别**：ERROR

**规则描述**：所有安装/运行命令必须同时满足：
1. **包管理器明确**：命令前有 `npm`/`brew`/`pip` 等明确标识
2. **版本约束存在**：Node.js 包标注 engine 范围，pip 包标注版本约束
3. **验证命令存在**：安装步骤块内紧跟验证命令（`--version`、`verify`、`--help`）

禁止在未说明适用场景的情况下同时列出多个等效包管理器命令。

**触发条件**：
- 安装步骤中出现 `npm install`/`yarn`/`pnpm` 但未标注版本约束
- 安装块结束后 5 行内无任何验证命令
- 多个包管理器命令并列且无 `(recommended)` / `on macOS` / `on Linux` 等说明

**检验逻辑**（bash + Python）：

```python
#!/usr/bin/env python3
"""AFR-002: Installation command disambiguation check."""

import re
import sys
import pathlib

def check_install_unambiguity(readme_path: str) -> list[str]:
    errors = []
    warnings = []
    content = pathlib.Path(readme_path).read_text()
    lines = content.split('\n')

    # Find ## Installation or ## Quick Start block
    in_install_block = False
    install_lines = []
    block_start = 0

    for i, line in enumerate(lines):
        if re.match(r'^## (Installation|Quick Start|快速开始)', line, re.IGNORECASE):
            in_install_block = True
            block_start = i
            install_lines.append(line)
        elif in_install_block:
            if re.match(r'^## ', line):
                break  # next section
            install_lines.append(line)

    block_text = '\n'.join(install_lines)

    # Test 1: npm/yarn/pnpm without version constraint → ERROR
    js_pkg_managers = re.findall(r'\b(npm|yarn|pnpm)\s+(install|add)', block_text)
    if js_pkg_managers:
        # Look for node/npm version constraint in the block or above
        preamble = '\n'.join(lines[max(0, block_start-10):block_start])
        if not re.search(r'node[.]js\s*[><=]+\s*[\d.]+|node\s+--version', preamble + block_text):
            errors.append(
                f"AFR-002 ERROR: JavaScript package manager found in ## Installation "
                f"without Node.js version constraint"
            )

    # Test 2: pip without version constraint → WARNING
    pip_cmds = re.findall(r'\bpip3?\s+install', block_text)
    if pip_cmds and not re.search(r'pip install\s+[a-zA-Z][\w-]+[=>][\d.]+|pip install\s+-e', block_text):
        warnings.append(
            "AFR-002 WARNING: pip install found without explicit version constraint"
        )

    # Test 3: No verification command in install block → ERROR
    verification_patterns = [
        r'\$?\s*\w+[\w-]*\s+--version',
        r'\$?\s*\w+[\w-]*\s+-v',
        r'verify|验证',
        r'# verify|# 验证',
        r'should output|应输出',
    ]
    has_verification = any(re.search(p, block_text, re.IGNORECASE) for p in verification_patterns)
    if not has_verification and install_lines:
        errors.append(
            "AFR-002 ERROR: No verification command found in installation block. "
            "Add a verification step (e.g., `program --version`)."
        )

    # Test 4: Multiple equivalent package managers without disambiguation → WARNING
    pm_count = sum([
        bool(re.search(r'\bnpm\b', block_text)),
        bool(re.search(r'\byarn\b', block_text)),
        bool(re.search(r'\bpnpm\b', block_text)),
        bool(re.search(r'\bbrew\b.*install', block_text, re.IGNORECASE)),
    ])
    if pm_count >= 2:
        disambig_patterns = [
            r'\b(recommended|preferred|推荐)',
            r'\b(macOS|Linux|Windows)\b',
            r'\b(choose|pick|选一)\b',
        ]
        has_disambig = any(re.search(p, block_text, re.IGNORECASE) for p in disambig_patterns)
        if not has_disambig:
            warnings.append(
                f"AFR-002 WARNING: Multiple package managers found in installation block "
                f"without disambiguation (recommended/preferred/macOS/Linux/choose)"
            )

    return errors + warnings

if __name__ == '__main__':
    msgs = check_install_unambiguity(sys.argv[1] if len(sys.argv) > 1 else 'README.md')
    for msg in msgs:
        print(msg)
    sys.exit(1 if any('ERROR' in m for m in msgs) else 0)
```

**正面示例**：
```markdown
## Installation

Requires: Node.js >= 18.0.0, npm >= 9.0.0

### macOS (Homebrew, recommended)
brew install madlouse/agenticos/agenticos

### Linux/macOS (npm)
npm install -g agenticos-mcp

### Verify
agenticos-list   # should list registered projects; no session project is highlighted until you switch
```

**反面示例**：
```markdown
## Installation

npm install -g agenticos-mcp   <!-- 无 Node.js 版本约束 -->
yarn add agenticos-mcp          <!-- 两个包管理器并列，无说明 -->
                                  <!-- 无验证命令 -->
```

---

### AFR-003：代码块语言标识

**严重级别**：WARNING

**规则描述**：所有 fenced code block 必须标注语言标识符（` ```bash `、` ```typescript ` 等）。空语言标识符（仅有 ` ``` `）触发 WARNING。

**触发条件**：` ``` ` 后紧跟换行，且下一非空行不以语言标识符开头。

**检验逻辑**（Python）：

```python
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
            # We're inside a code fence with no language identifier
            if line.strip() and not re.match(r'^```', line):
                warnings.append(
                    f"AFR-003 WARNING: Code fence starting at line {fence_start_line} "
                    f"has no language identifier. "
                    f"First content line: '{line[:50]}'"
                )
                in_fence = False  # report once per fence
                continue

    return warnings

if __name__ == '__main__':
    warnings = check_code_fence_language(sys.argv[1] if len(sys.argv) > 1 else 'README.md')
    for w in warnings:
        print(w)
    sys.exit(1 if warnings else 0)
```

**正面示例**：
````markdown
```bash
npm install -g agenticos-mcp
```

```typescript
const result = await agenticos_init({ name: 'my-project' });
```
````

**反面示例**：
````markdown
```
npm install -g agenticos-mcp
```
````

---

### AFR-004：工具引用一致性

**严重级别**：WARNING

**规则描述**：README 中同一工具/API 必须使用统一名称。禁止在首次引入后改用不同称呼而不加说明。

**触发条件**：在全文范围内，同一实体出现两个以上不同名称。

**内置别名表**（AgenticOS 项目强制使用）：

| 规范名称 | 禁止混用变体 |
|---------|------------|
| Claude Code | claude-code, Claude Code, claude code |
| agenticos-mcp | AgenticOS, agenticos |
| GitHub | github |
| Node.js | node, NodeJS, Node |
| Homebrew | brew |
| npm | node package manager |

**检验逻辑**（Python）：

```python
#!/usr/bin/env python3
"""AFR-004: Tool name consistency check."""

import re
import sys
import pathlib

# AgenticOS-specific alias table
ALIAS_TABLE = {
    'Claude Code': ['claude-code', 'Claude Code', 'claude code', 'ClaudeCode'],
    'agenticos-mcp': ['AgenticOS', 'agenticos', 'agenticos-mcp'],
    'GitHub': ['github', 'Github'],
    'Node.js': ['Node.js', 'NodeJS', 'node', 'Node'],
    'Homebrew': ['brew', 'homebrew'],
    'npm': ['node package manager', 'npm'],
}

def check_tool_consistency(readme_path: str) -> list[str]:
    warnings = []
    content = pathlib.Path(readme_path).read_text()

    for canonical, variants in ALIAS_TABLE.items():
        # Check which names actually appear in the document
        found = [canonical]
        found_variants = []
        for variant in variants:
            if re.search(r'\b' + re.escape(variant) + r'\b', content):
                found_variants.append(variant)

        if len(found_variants) > 0:
            # If canonical and any variant both appear → inconsistency
            warnings.append(
                f"AFR-004 WARNING: Canonical name '{canonical}' mixed with variants "
                f"{found_variants}. Use '{canonical}' consistently throughout."
            )

    return warnings

if __name__ == '__main__':
    warnings = check_tool_consistency(sys.argv[1] if len(sys.argv) > 1 else 'README.md')
    for w in warnings:
        print(w)
```

**正面示例**：
```markdown
Claude Code 是主要开发工具。所有操作均通过 Claude Code 的 MCP 接口执行。
```

**反面示例**：
```markdown
Claude Code 是主要开发工具。
claude-code 工具还提供命令行接口。   <!-- 混用 -->
```

---

### AFR-005：警告标记语义化

**严重级别**：WARNING

**规则描述**：警告内容（危险操作、不可逆操作、弃用路径）必须使用语义化标记，禁止纯文本描述警告。

**合法标记**：
1. Markdown alert（推荐）：`> [!WARNING]` / `> [!CAUTION]` / `> [!NOTE]` / `> [!TIP]`
2. Emoji 前缀：`⚠️` / `🔴` / `📌` / `❗`（行首）

**触发条件**：行内包含 `注意` / `WARNING` / `CAUTION` / `DANGER` / `IMPORTANT` / `千万别` / `不要在` / `切勿` 且该行不以合法标记开头。

**检验逻辑**（Python）：

```python
#!/usr/bin/env python3
"""AFR-005: Semantic warning marker check."""

import re
import sys
import pathlib

LEGAL_PREFIXES = re.compile(r'^(\s*> \[!(?:WARNING|CAUTION|NOTE|TIP|INFO|DANGER)\]|'
                            r'\s*[⚠️🔴📌❗]\s*)')

WARNING_KEYWORDS = re.compile(
    r'\b(注意|WARNING|CAUTION|DANGER|IMPORTANT|千万别|不要在|切勿|'
    r'do not|never|do NOT|warning|warn)\b',
    re.IGNORECASE
)

def check_semantic_warnings(readme_path: str) -> list[str]:
    warnings = []
    content = pathlib.Path(readme_path).read_text()
    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if WARNING_KEYWORDS.search(stripped) and not LEGAL_PREFIXES.match(line):
            # Exclude lines that are heading/title (contain # at start)
            if stripped.startswith('#'):
                continue
            # Exclude lines that are already in a table (| WARNING |)
            if '|' in stripped and stripped.startswith('|'):
                continue
            warnings.append(
                f"AFR-005 WARNING: Potential unstyled warning at line {i}: "
                f"'{stripped[:60]}' — use '> [!WARNING]' or '⚠️' prefix."
            )

    return warnings

if __name__ == '__main__':
    warnings = check_semantic_warnings(sys.argv[1] if len(sys.argv) > 1 else 'README.md')
    for w in warnings:
        print(w)
```

**正面示例**：
```markdown
> [!WARNING]
> 此操作不可逆，请确认已备份数据。

⚠️ Do not run this in production without a backup.
```

**反面示例**：
```markdown
注意：此操作不可逆，请确认已备份数据。
WARNING: This command will delete all data.
```

---

### AFR-006：AI 执行入口存在性

**严重级别**：RECOMMENDATION

**规则描述**：README 应包含至少一个 AI 可直接执行的命令块，使 Agent 能从 README 立即开始工作，无需额外搜索。

**触发条件**（满足任一）：
1. 包含 `EXECUTE NOW` / `execute now` / `立即执行` 标记
2. 存在 `install.md` 或 `INSTALL.md` 的 Markdown 链接
3. `## Quick Start` 块内包含以 `$ ` / `npm ` / `brew ` / `curl ` / `git ` 开头的可执行命令行

**检验逻辑**（bash）：

```bash
#!/usr/bin/env bash
# AFR-006: AI execution entry existence check.

check_ai_entry() {
  local readme="${1:-README.md}"
  local status=0

  # Pattern 1: EXECUTE NOW marker
  if grep -qiE '(?i)execute now|exec now|立即执行' "$readme"; then
    echo "AFR-006 PASS: EXECUTE NOW block found"
    return 0
  fi

  # Pattern 2: install.md link
  if grep -qE '\[.*install.*\]\(.*install.*\.md\)' "$readme"; then
    echo "AFR-006 PASS: install.md link found"
    return 0
  fi

  # Pattern 3: Quick Start with executable commands
  local qs_block
  qs_block=$(sed -n '/^## \(Quick Start\|Quickstart\|快速开始\|Quick start\)/,/^## /p' "$readme" | head -n -1)
  if echo "$qs_block" | grep -qE '^\s*\$ |^\s*(npm |brew |curl |git |pip )'; then
    echo "AFR-006 PASS: Executable commands found in Quick Start"
    return 0
  fi

  echo "AFR-006 RECOMMENDATION: No clear AI-executable entry found. Add EXECUTE NOW or a Quick Start with runnable commands."
  status=1
  return $status
}

check_ai_entry "$@"
```

**正面示例**：
```markdown
## Quick Start

<!-- EXECUTE NOW -->
npm install -g agenticos-mcp && agenticos-list
```

**反面示例**：
```markdown
## Quick Start

Please refer to [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed setup instructions.
```

---

### AFR-007：链接完整性

**严重级别**：WARNING

**规则描述**：所有相对 Markdown 链接（`.md` 文件）必须在仓库中存在。图片引用同理。

**触发条件**：相对链接指向的文件在仓库中不存在。

**检验逻辑**（Python）：

```python
#!/usr/bin/env python3
"""AFR-007: Link integrity check."""

import re
import sys
import pathlib

def check_link_integrity(readme_path: str) -> list[str]:
    warnings = []
    readme_dir = pathlib.Path(readme_path).parent
    content = pathlib.Path(readme_path).read_text()

    # Find relative .md links
    md_links = re.findall(r'\[([^\]]+)\]\(([^)]+\.md)\)', content)
    for label, link in md_links:
        if link.startswith('#'):
            continue  # anchor-only link, skip
        # Remove anchor part
        link_file = link.split('#')[0]
        target = readme_dir / link_file
        if not target.exists():
            warnings.append(
                f"AFR-007 WARNING: Linked file not found: '{link}' "
                f"(label: '{label}', resolved: {target})"
            )

    # Find local image references
    img_links = re.findall(r'!\[([^\]]*)\]\(([^)]+\.(?:png|jpg|gif|svg|webp))\)', content)
    for label, link in img_links:
        if link.startswith('http'):
            continue
        target = readme_dir / link
        if not target.exists():
            warnings.append(
                f"AFR-007 WARNING: Linked image not found: '{link}' "
                f"(resolved: {target})"
            )

    return warnings

if __name__ == '__main__':
    warnings = check_link_integrity(sys.argv[1] if len(sys.argv) > 1 else 'README.md')
    for w in warnings:
        print(w)
```

**正面示例**：
```markdown
See [Architecture](./ARCHITECTURE.md) for details.   <!-- ARCHITECTURE.md 存在 -->
```

**反面示例**：
```markdown
See [Setup Guide](./setup.md) for details.   <!-- setup.md 不存在 -->
```

---

### AFR-008：文档单一性原则

**严重级别**：WARNING

**规则描述**：安装步骤的完整信息应只出现在一个位置（README.md 或独立的 `install.md`），不允许两处同时出现完整内容导致信息不一致。

**触发条件**：
1. `install.md` 或 `INSTALL.md` 存在，且 README.md 的 `## Installation` 超过 10 行
2. `## Installation` 块与 `install.md` 内容高度重复（未引用）

**检验逻辑**（bash）：

```bash
#!/usr/bin/env bash
# AFR-008: Single source of truth for installation.

check_single_source() {
  local readme="${1:-README.md}"
  local warnings=0

  if [[ -f "install.md" ]] || [[ -f "INSTALL.md" ]]; then
    local install_file="install.md"
    [[ -f "INSTALL.md" ]] && install_file="INSTALL.md"

    # Count lines in README's ## Installation block
    local readme_install_lines
    readme_install_lines=$(sed -n '/^## \(Installation\|安装\)/,/^## /p' "$readme" | grep -c .)

    if [[ "$readme_install_lines" -gt 10 ]]; then
      echo "AFR-008 WARNING: README's ## Installation block has $readme_install_lines lines (>10), while $install_file also exists."
      echo "  Keep installation details in $install_file only; README should reference it."
      ((warnings++))
    fi

    # Check README references install.md
    if ! grep -qE 'install\.md|INSTALL\.md' "$readme"; then
      echo "AFR-008 WARNING: README has ## Installation but does not reference $install_file."
      ((warnings++))
    fi
  fi

  return $warnings
}

check_single_source "$@"
```

**正面示例**：
```markdown
## Installation

See [INSTALL.md](./INSTALL.md) for detailed platform-specific instructions.
```

**反面示例**：
```markdown
## Installation

### macOS
1. brew install xxx
...

### Linux
1. apt install xxx
...
<!-- install.md 也包含相同完整内容 -->
```

---

### AFR-009：llms.txt 或等效 AI 文档

**严重级别**：RECOMMENDATION

**规则描述**：项目应提供机器可读的 AI 优化文档（`llms.txt`、`.github/llms.txt`、`docs/ai-summary.md` 等），或明确告知 Agent 该 README 即为主 AI 入口。

**触发条件**（满足任一则 PASS）：
- `llms.txt` 存在
- `.github/llms.txt` 存在
- `docs/ai-summary.md` 或 `docs/llms.md` 存在
- README.md 包含 `[llms.txt]` 链接

**检验逻辑**（bash）：

```bash
#!/usr/bin/env bash
# AFR-009: Dedicated AI documentation existence check.

AI_DOC_PATTERNS=(
  "llms.txt"
  ".github/llms.txt"
  "docs/ai-summary.md"
  "docs/llms.md"
  "AI_SUMMARY.md"
)

check_ai_doc() {
  local status=0
  for doc in "${AI_DOC_PATTERNS[@]}"; do
    if [[ -f "$doc" ]]; then
      echo "AFR-009 PASS: Found $doc"
      return 0
    fi
  done
  echo "AFR-009 RECOMMENDATION: No dedicated AI documentation file found."
  echo "  Consider creating llms.txt, .github/llms.txt, or docs/ai-summary.md."
  return 1
}

check_ai_doc
```

---

### AFR-010：README 长度控制

**严重级别**：INFO

**规则描述**：
1. README.md 正文建议控制在 500 行以内，超出时将深度内容移至独立文档
2. 前 20 行内徽章/图片引用建议不超过 5 个

**触发条件**：
1. `wc -l README.md` > 500
2. 前 20 行包含超过 5 个 `![...](...)` 模式

**检验逻辑**（bash）：

```bash
#!/usr/bin/env bash
# AFR-010: README length control.

check_length() {
  local readme="${1:-README.md}"
  local lines
  lines=$(wc -l < "$readme")

  if [[ "$lines" -gt 500 ]]; then
    echo "AFR-010 INFO: README.md has $lines lines (guideline: <= 500). Consider extracting detailed content."
  fi

  # Check badges in first 20 lines
  local first_20
  first_20=$(head -20 "$readme")
  local badge_count
  badge_count=$(echo "$first_20" | grep -cE '!\[.*\]\(.*\)')
  if [[ "$badge_count" -gt 5 ]]; then
    echo "AFR-010 INFO: First 20 lines contain $badge_count badges/images (>5). Move excess badges below ## Quick Start."
  fi

  return 0  # INFO level, always pass
}

check_length "$@"
```

---

## 4. 手动检查清单

Agent 在提交 PR 前，对照以下清单逐项检查 README：

```
# Agent-Friendly README 检查清单

## 必须通过（ERROR → 必须修复）
- [ ] AFR-001: 第一行是 # 标题（H1）
- [ ] AFR-001: 存在至少一个 ## 标题（H2）
- [ ] AFR-001: 无 H3 先于 H2 出现
- [ ] AFR-002: 所有安装命令有包管理器标识
- [ ] AFR-002: Node.js/pip 包有版本约束
- [ ] AFR-002: 安装块内有验证命令

## 建议通过（WARNING → 尽量修复）
- [ ] AFR-003: 所有代码块有语言标识（bash/python/typescript等）
- [ ] AFR-004: 工具名称全文一致（参考别名表）
- [ ] AFR-005: 警告使用 > [!WARNING] 或 ⚠️ 前缀
- [ ] AFR-007: 所有 .md 链接目标存在
- [ ] AFR-008: 安装内容不与 install.md 重复

## 推荐（RECOMMENDATION）
- [ ] AFR-006: 有 EXECUTE NOW 块或 Quick Start 含可执行命令
- [ ] AFR-009: 存在 llms.txt 或 docs/ai-summary.md

## 提示（INFO，可忽略）
- [ ] AFR-010: README 总行数 <= 500
- [ ] AFR-010: 前 20 行徽章 <= 5 个
```

---

## 5. 自动化工具规格

### 5.1 readme-lint.sh 本地脚本

**路径**：`scripts/readme-lint.sh`

**输入**：`$1` = README 文件路径（默认为 `README.md`）

**输出**：一行一个 message，格式为 `{level} {rule_id} {file}:{line}: {message}`

**退出码**：
- `0`：无 ERROR
- `1`：存在 ERROR
- `2`：脚本内部错误

**依赖**：bash + python3

**与 CI 的关系**：本地开发使用此脚本；CI 使用 `.github/workflows/readme-lint.yml`。

### 5.2 GitHub Action readme-lint.yml

参见阶段三交付物 `.github/workflows/readme-lint.yml`。

**输入规格**：
- `github.workspace`：仓库根目录
- `matrix.readme`：遍历所有 `README.md` 和 `projects/*/README.md`

**输出规格**：
- GitHub annotation（`::error` / `::warning` / `::notice`）
- annotation 格式：`file={path},line={n}::{level}: {message}`

**严重级别映射**：

| AFR 级别 | CI annotation 级别 |
|---------|-----------------|
| ERROR | error（阻止合并） |
| WARNING | warning（CI 通过，PR 审查时修复） |
| RECOMMENDATION | notice |
| INFO | notice |

**AFR-002/004/007/008**（PARTIAL 自动化）：作为 `continue-on-error: true` 的 step 运行，不阻止 CI。

---

## 6. 与 GitHub Flow 标准的集成

### 6.1 引用关系

本规范作为 AgenticOS GitHub Flow 标准（`knowledge/open-source-workflow-research.md`）的扩展规范存在。

在 `open-source-workflow-research.md` 中增加引用：

```markdown
## README 文档质量标准

参见：`agent-friendly-readme-spec-v1.md`

所有 AgenticOS 项目和下游项目的 README 应通过 AFR-001 至 AFR-010 检查。

PR 合入前必须通过 AFR-001（ERROR）和 AFR-002（ERROR）检查。
```

### 6.2 GitHub Flow PR 验证流程中的嵌入点

```
PR opened
    ↓
CI: readme-lint.yml runs
    ↓
AFR-001/002 → ERROR: blocks merge
AFR-003/004/005/007/008 → WARNING: reviewer requests fix
AFR-006/009/010 → RECOMMENDATION: noted, optional
    ↓
Reviewer checks README checklist
    ↓
README approved (all ERROR fixed)
    ↓
PR merged
```

### 6.3 下游项目继承

本规范以 `recommended` 等级注册到 `.meta/standard-kit/manifest.yaml` 的 `downstream_doc_standards` 节。

下游项目采纳后：
- `agenticos_standard_kit_adopt` 会引导用户检查 README 是否符合 AFR-001/002
- `agenticos_standard_kit_upgrade_check` 会提示规范更新

---

## 7. 版本与变更管理

### 7.1 规范版本语义

| 版本变化 | 含义 |
|---------|------|
| `x.0.0` 主版本 | 规则编号变化或 ERROR 级别调整（需评审） |
| `0.x.0` 次版本 | 新增规则或提升 WARNING 级别 |
| `0.0.x` 补丁 | 规则描述澄清、检验逻辑修正 |

### 7.2 弃用通知

当规范版本升级导致现有 README 不兼容时：
1. 在规范的 `changelog` 节记录弃用说明
2. 在 `manifest.yaml` 的 `downstream_doc_standards` 中标注兼容版本范围
3. CI 中对旧版本规则使用 WARNING 而非 ERROR

---

## 附录 A：AFR 规则速查表

| ID | 名称 | ERROR | WARNING | RECOMMENDATION | INFO | 可自动化 |
|----|------|-------|---------|---------------|------|---------|
| AFR-001 | 标题层级完整性 | ✅ | | | | YES |
| AFR-002 | 安装命令无歧义 | ✅ | | | | PARTIAL |
| AFR-003 | 代码块语言标识 | | ✅ | | | YES |
| AFR-004 | 工具引用一致性 | | ✅ | | | PARTIAL |
| AFR-005 | 警告标记语义化 | | ✅ | | | YES |
| AFR-006 | AI 执行入口存在性 | | | ✅ | | YES |
| AFR-007 | 链接完整性 | | ✅ | | | PARTIAL |
| AFR-008 | 文档单一性原则 | | ✅ | | | YES |
| AFR-009 | llms.txt 存在性 | | | ✅ | | YES |
| AFR-010 | README 长度控制 | | | | ✅ | YES |
