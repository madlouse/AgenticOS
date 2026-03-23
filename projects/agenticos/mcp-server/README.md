# AgenticOS MCP Server

AI-native project management for complex, persistent tasks.

---

## 📖 For Humans

### What is AgenticOS?

A project management system designed for AI collaboration. When you work on complex tasks with AI assistants, AgenticOS:

- **Records everything** - Conversations, decisions, code changes
- **Resumes seamlessly** - Pick up where you left off, even weeks later
- **Works everywhere** - Claude Code, Cursor, Codex, any MCP-compatible tool
- **Backs up automatically** - Git integration keeps your work safe
- **Stays organized** - AI manages the structure, you focus on building

### Quick Start

Tell your AI assistant:

```
"安装 AgenticOS"
```

The AI will configure everything automatically. Then start using:

```
"创建新项目来管理 XXX"
"切换到 XXX 项目"
"列出所有项目"
```

### When to Use

AgenticOS is ideal for:
- Multi-step implementations
- Cross-session work (resume later)
- Complex refactoring
- Feature development with many decisions
- Any task where you want complete history

### Project Structure

Each project contains:
```
my-project/
├── .project.yaml          # Project metadata (human & AI readable)
├── .context/
│   ├── quick-start.md     # Quick overview
│   ├── state.yaml         # Current session state
│   └── conversations/     # Full conversation logs
├── knowledge/             # Extracted insights & decisions
├── tasks/                 # Task tracking
└── artifacts/             # Code, configs, outputs
```

---

## 🤖 For AI Agents: Installation Protocol

### When user says: "安装 AgenticOS" / "配置 AgenticOS" / "setup AgenticOS"

Execute these steps autonomously:

#### Step 1: Add MCP Configuration

Detect AI tool and update config:
- **Claude Code/Kiro**: `~/.claude/settings/mcp.json` or `~/.kiro/settings/mcp.json`
- **Cursor**: `~/.cursor/settings/mcp.json`
- **Codex**: Check Codex MCP config path

Read existing config, merge this:
```json
{
  "mcpServers": {
    "agenticos": {
      "command": "npx",
      "args": ["-y", "agenticos-mcp"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

#### Step 2: Add Trigger Logic

Append to user-level config (`~/.claude/CLAUDE.md`, etc.):

```markdown
## 🚀 AgenticOS Integration

### When to Suggest Creating a Project

Check for complexity signals:
- Task requires 3+ steps
- Multiple files involved
- Cross-session tracking needed
- Keywords: "项目"、"长期"、"持续"、"管理"

Ask user:
"这个任务较复杂且具有持续性，是否需要创建 AgenticOS 项目来管理？

AgenticOS 提供：
- 完整记录所有决策和对话
- 跨会话恢复工作状态
- 自动备份到 Git
- 跨工具使用"

### Explicit Commands
- "切换到 XX 项目" → agenticos_switch
- "创建新项目" → agenticos_init
- "列出项目" → agenticos_list
- "保存项目" → agenticos_save
```

#### Step 3: Initialize System

```bash
mkdir -p ~/AgenticOS/.agent-workspace
```

Create `~/AgenticOS/.agent-workspace/registry.yaml`:
```yaml
version: "1.0.0"
last_updated: "2026-03-16T08:52:20Z"
active_project: null
projects: []
```

#### Step 4: Verify & Report

1. Call `agenticos_list` tool
2. Confirm it returns project list or "No projects found"
3. Tell user: "✅ AgenticOS 已配置完成"

---

## 🛠️ Tools Reference

### agenticos_init
Create new project with standard structure.

**Parameters**:
- `name` (required) - Project name
- `description` (optional) - What this project is about
- `path` (optional) - Custom location (default: ~/AgenticOS/projects/{id})

**Returns**: Project created confirmation with path and ID

### agenticos_switch
Switch to existing project and load context.

**Parameters**:
- `project` (required) - Project ID or name

**Returns**: Loaded context (project config, quick-start, state)

### agenticos_list
List all projects with status.

**Returns**: Formatted list with active project highlighted

### agenticos_save
Save state and backup to Git.

**Parameters**:
- `message` (optional) - Commit message

**Returns**: Backup confirmation with timestamp

### agenticos_status
Show the status of the active project.

**Returns**: Current task, pending items, and recent decisions

### agenticos_preflight
Run machine-checkable guardrail preflight before implementation or PR creation.

**Parameters**:
- `task_type` (required)
- `repo_path` (required)
- `issue_id` (required for implementation work)
- `declared_target_files` (required for implementation work)

**Returns**: JSON with `PASS`, `BLOCK`, or `REDIRECT`

### agenticos_branch_bootstrap
Create an issue branch and isolated worktree from the intended remote base.

**Parameters**:
- `issue_id` (required)
- `slug` (required)
- `repo_path` (required)
- `worktree_root` (required)
- `remote_base_branch` (optional, default `origin/main`)

**Returns**: JSON with `CREATED` or `BLOCK`

### agenticos_pr_scope_check
Validate that the current branch diff stays within the intended issue scope.

**Parameters**:
- `issue_id` (required)
- `repo_path` (required)
- `declared_target_files` (required)
- `remote_base_branch` (optional, default `origin/main`)

**Returns**: JSON with `PASS` or `BLOCK`

---

## 📦 Resources Reference

### agenticos://context/current
Get complete context for active project.

**Returns**:
- Project configuration (.project.yaml)
- Quick start guide
- Current session state

---

## 🔒 Privacy & Security

- All data stored locally in `~/AgenticOS/`
- No external servers or telemetry
- Git backup is optional and user-controlled
- Safe for public npm distribution

## 📄 License

MIT
