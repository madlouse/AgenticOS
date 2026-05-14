# Simplified PWD Alignment Design (#405)

## Status: Draft

## Background

Issue #332/#333 导致 MCP 故障，修复后发现 session lock 机制存在根本性缺陷：
- 多 Agent/多窗口并发时锁竞争导致 "failed to acquire session lock" 错误
- 锁机制增加了不必要的复杂性
- active-project 文件从未被读取，属于死代码

## Design Principles

1. **简单可靠** — 不引入过多复杂性
2. **session ID 唯一性** — 每个会话使用唯一 ID，无需锁竞争
3. **内存优先** — 会话绑定仅存内存，session resume 自然保持状态
4. **最小化持久化** — 只保留必要状态

## Current Problems (from Agent team analysis)

| Component | Problem |
|-----------|---------|
| Session lock | 多进程竞争，每次尝试验锁 50 次 × 10ms 延迟 |
| mkdir as mutex | 原子性依赖文件系统，不可靠 |
| active-project file | 写入但从未读取，死代码 |
| Atomic write | 写 .active-project 时先写临时文件再 rename，但无并发保护 |

## Proposed Simplified Architecture

### Remove (Dead Code)
- ~~Session lock mechanism~~ — 不需要，每个 session 有唯一 ID
- ~~active-project file persistence~~ — 从未被读取
- ~~atomic write for active-project~~ — 同上

### Keep (In-Memory Only)

**bindSessionProject()** — 内存中的 session → project 映射
```typescript
// 内存 Map，不写文件
const sessionProjectMap = new Map<string, string>();

export async function bindSessionProject(sessionId: string, projectPath: string): Promise<void> {
  sessionProjectMap.set(sessionId, projectPath);
}
```

**alignPwd()** — 生成 agent 特定的 PWD 指令
```typescript
export function alignPwd(projectPath: string, agentType: string): string {
  switch (agentType) {
    case 'claude-code':
      return `cd ${projectPath} && pwd`;
    case 'codex':
      return `codex -C ${projectPath}`;
    case 'cursor':
      return `cd ${projectPath}`; // Cursor 通过 mcp.json 配置
    default:
      return `cd ${projectPath}`;
  }
}
```

**Session Resume** — PWD 由 agent runtime 自然保持
- Claude Code / Codex 切换目录后，runtime 自动记住 PWD
- 不需要 active-project 文件来恢复

## Implementation Changes

### File: mcp-server/src/utils/session-context.ts

**Before (complex):**
```typescript
async function withSessionLock<T>(sessionId: string, callback: () => Promise<T>) {
  const lockPath = getSessionLockPath(sessionId);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await mkdir(lockPath);
      break;
    } catch {
      await sleep(10);
    }
  }
  // ... critical section ...
  await rmdir(lockPath);
}
```

**After (simple):**
```typescript
// 无锁，直接操作内存 Map
const sessionProjectMap = new Map<string, string>();

export async function bindSessionProject(
  sessionId: string,
  projectPath: string
): Promise<void> {
  sessionProjectMap.set(sessionId, projectPath);
}

export function getSessionProject(sessionId: string): string | undefined {
  return sessionProjectMap.get(sessionId);
}
```

### File: mcp-server/src/tools/project.ts

**Changes:**
1. `switchProject()` 调用 `bindSessionProject()` 写入内存
2. 调用 `alignPwd()` 生成 agent 特定指令
3. 移除 `acquireSessionLock()` / `releaseSessionLock()` 调用
4. 移除 `writeActiveProjectFile()` 调用

### File: mcp-server/src/utils/standard-kit.ts

**No changes** — standard-kit 功能与 session 管理无关

## Files to Delete

```
mcp-server/src/utils/active-project.ts  # 死代码，从未被读取
```

## Migration Path

1. 新实现仅保留内存映射，无数据迁移需求
2. 旧版写入的 `~/.agent-workspace/sessions/*/active-project` 文件可保留（不再写入）
3. 未来清理时删除即可

## Verification

```bash
# 测试多窗口并发
# 窗口1: agenticos_project_switch --project agenticos
# 窗口2: agenticos_project_switch --project agenticos
# 两者都应成功，无锁竞争错误

# 测试 session resume
# 断开重连后，PWD 应由 agent runtime 自然保持
```

## Related Issues

- #332/#333: MCP 故障排查
- #397: PWD alignment design (superseded)