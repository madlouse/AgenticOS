# Simplified PWD Alignment Design (#405)

## Status: Implemented

## Background

Issue #332/#333 导致 MCP 故障，修复后发现 session lock 机制存在根本性缺陷：
- 多 Agent/多窗口并发时锁竞争导致 "failed to acquire session lock" 错误
- 锁机制增加了不必要的复杂性
- active-project 文件从未被读取，属于死代码

经过设计评审，原始需求的核心是：
**切换项目时，PWD 应该自动切换到项目目录，切换后验证，不成功则提示用户手动执行。**

## Design Principles

1. **简单可靠** — 不引入过多复杂性
2. **无锁机制** — 每个 session 独立，无需锁竞争
3. **自动切换 + 验证** — 执行 cd 并验证结果
4. **最小化持久化** — 内存绑定 + 失败警告

## Architecture

### Core Flow

```
switchProject()
    ↓
bindSessionProject() → 内存记录当前项目
    ↓
alignPwd(projectPath)
    ↓
1. 验证路径安全性（绝对路径，无 .. 遍历）
2. 检查目录是否存在
3. 执行 cd + pwd 验证
4. 成功 → 返回 success
5. 失败 → 返回 warning + 手动指令
```

### Implementation: alignPwd()

```typescript
export async function alignPwd(projectPath: string): Promise<PwdAlignmentResult> {
  // 1. 验证路径安全
  const security = validatePathSecurity(projectPath);
  if (!security.valid) {
    return { success: false, instruction: null, warning: security.error };
  }

  // 2. 检查目录存在
  if (!existsSync(projectPath)) {
    return { success: false, instruction: null, warning: '目录不存在' };
  }

  // 3. 执行 cd 并验证
  const beforePwd = await getCurrentPwd();
  const cdSuccess = await executeCd(projectPath);
  const afterPwd = await getCurrentPwd();

  // 4. 验证结果
  if (afterPwd === projectPath) {
    return { success: true, instruction: ..., warning: null };
  }

  // 5. 失败返回警告
  return {
    success: false,
    instruction: ...,  // 手动指令
    warning: `PWD alignment failed. Expected: ${projectPath}, Got: ${afterPwd}. Please run: ${instruction}`
  };
}
```

## Changes from Original Design

| Component | Before (#397) | After (#405) |
|-----------|---------------|--------------|
| Session lock | mkdir mutex (50次重试) | ❌ 删除 |
| active-project 持久化 | temp+rename 原子写入 | ❌ 删除 |
| bindSessionProjectAsync | 异步+持久化 | ✅ 简化为 bindSessionProject (同步内存) |
| alignPwd | 只返回指令文本 | ✅ 执行 cd + 验证 + 失败警告 |
| getSessionBinding | 读取文件 | ❌ 删除 |

## Files Changed

1. **mcp-server/src/utils/session-context.ts**
   - 删除: withSessionLock, getSessionLockPath, writeSessionBindingAtomic, getSessionBinding, SessionBindingRecord
   - 新增: getCurrentPwd(), executeCd() 内部函数
   - 修改: alignPwd() 现在执行 cd 而不只是返回文本

2. **mcp-server/src/tools/project.ts**
   - 移除 bindSessionProjectAsync 调用
   - 使用同步 bindSessionProject

## Verification

```bash
# 切换项目并检查 PWD
agenticos project switch --project agenticos
# 应该看到 PWD 已切换，或者警告提示手动执行

# 多窗口并发测试（无锁竞争）
# 窗口1: agenticos project switch --project agenticos
# 窗口2: agenticos project switch --project agenticos
# 两者都应成功
```

## Limitations

MCP server 作为独立进程，无法直接改变用户 shell 的 PWD。`executeCd()` 在子进程中执行 cd，只验证目录可访问性。实际的 PWD 切换需要：
- Claude Code: EnterWorktree tool
- Codex: codex -C 命令
- 其他: 手动 cd

alignPwd 的验证逻辑帮助确认目录是否可访问，失败时返回手动指令。

## Related Issues

- #332/#333: MCP 故障排查
- #393: 原始 PWD 对齐需求
- #394: partial implementation
- #397: atomic sessions design (superseded by this)
- #405: this implementation