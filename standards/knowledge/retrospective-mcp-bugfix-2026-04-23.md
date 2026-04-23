# AgenticOS MCP 故障复盘与设计改进

> 生成时间：2026-04-23
> 触发事件：Homebrew 安装 AgenticOS MCP 后服务无法连接
> 涉及版本：v0.4.5 → v0.4.6 → v0.4.7

---

## 一、问题演化时间线

```
[t=0] 用户 brew install agenticos          # v0.4.5，含 #332 bug
[t=1] claude mcp list → ✗ Failed          # 症状出现
[t=2] 排查 isDirectExecution                # 发现 pathToFileURL 不解析 symlink
[t=3] 找到 GitHub fix commit f7fbadf       # v0.4.6 里已修 #332，但 #333 暴露
[t=4] 修 #333，发布 v0.4.7                 # 两个 bug 都修掉
[t=5] brew upgrade / 本地安装              # MCP Connected ✅
```

---

## 二、两个 Bug 互相掩盖的根因分析

### Bug #332 — isDirectExecution 路径比较不对称

**代码**：
```typescript
return pathToFileURL(entry).href === moduleUrl;
```

**不对称性**：
- `pathToFileURL(argv[1])` — OS 传入的路径字符串，**不跟随 symlink**
- `import.meta.url` — Node.js ESM 语义，**跟随 symlink 解析到真实路径**

**触发路径**（任意一层 symlink）：
```
/opt/homebrew/bin/agenticos-mcp  (argv[1])
    ↓ symlink
/opt/homebrew/opt/agenticos/bin/agenticos-mcp
    ↓ symlink
/opt/homebrew/Cellar/.../build/index.js   (import.meta.url 解析到这里)
```

### Bug #333 — process.exit 在非阻塞 connect 之后

**代码**：
```typescript
main().then((exitCode) => {
  process.exit(exitCode); // ← 错误：connect() 立即返回，还没处理任何消息
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
```

**StdioServerTransport.connect() 的语义**：
- 注册 stdin 事件监听器（异步）
- **立即返回**（非阻塞）
- 消息处理发生在事件循环的未来 tick

**结果**：`process.exit(0)` 在消息到达前执行，server 静默退出。

### 两 Bug 互相掩盖的数学逻辑

```
v0.4.5: isDirect = false → main() 不执行 → process.exit 不执行  → "正常"（假象）
v0.4.6: isDirect = true  → main() 执行    → process.exit 执行    → 崩溃（真象暴露）
```

只有同时修两个 bug 才能让系统真正正常。

---

## 三、设计缺陷清单

### D1 — isDirectExecution 的路径比较设计（高）

**问题**：用 `pathToFileURL(argv[1])` 和 `import.meta.url` 做等价判断，但两者对 symlink 的处理不一致。

**改进方向**：两边都解析 symlink，或用标记文件替代路径比较。

### D2 — main() 对 connect() 的假设错误（中）

**问题**：`main()` 假设 `connect()` 返回后 process 就应该结束，但实际上 `connect()` 的语义是"启动 transport 并保持运行"。

### D3 — 缺少对 MCP transport 生命周期的测试覆盖（高）

**问题**：两个 bug 都能在 CI 中通过简单的端到端测试发现，但都没有。

### D4 — CI 没有覆盖 symlink 安装路径（高）

**问题**：Homebrew 安装产生的 symlink 路径是用户最常用的安装方式，但 CI 只测试直接路径。

### D5 — 没有版本间的回归测试（高）

**问题**：v0.4.6 修 #332 后没有发现 #333，因为没有对比上一版本的端到端行为。

### D6 — Homebrew formula URL 使用通用文件名（中）

**问题**：`agenticos-mcp.tgz` 在 GitHub 不重定向到最新版，必须用 `agenticos-mcp-{version}.tgz`。

### D7 — AgenticOS 没有运行时健康检查工具（中）

**问题**：`claude mcp list` 只显示 "Failed to connect"，没有进一步诊断。

---

## 四、流程缺陷清单

### P1 — 没有在修 #332 时同步审查 #333

### P2 — 没有在 release 前运行端到端测试

### P3 — 没有 CI 对 Homebrew 安装方式的测试

---

## 五、推荐改进优先级

| 优先级 | 缺陷 | 成本 | 影响 |
|--------|------|------|------|
| P0 | D3 增加 MCP 端到端集成测试 | 低 | 防止 regression |
| P0 | D4 CI 测试 symlink 安装路径 | 低 | 覆盖真实场景 |
| P1 | D1 修 isDirectExecution 对称性 | 低 | 根本性修复 |
| P1 | D2 移除 main() 的 process.exit | 低 | 根本性修复 |
| P1 | D5 增加版本间回归测试 | 中 | 防止修 A 坏 B |
| P2 | D7 运行时健康检查 CLI | 中 | 提升诊断能力 |
| P2 | D6 formula URL 版本号 | 低 | Homebrew 可用 |

---

## 六、Agent Team 执行记录（2026-04-23）

### 已完成

| 优先级 | 任务 | PR | 状态 |
|--------|------|-----|------|
| P0 | D3: MCP 端到端集成测试 | [#337](https://github.com/madlouse/AgenticOS/pull/337) | ✅ 已合并 |
| P0 | D4: CI symlink 路径测试 | [#338](https://github.com/madlouse/AgenticOS/pull/338) | ✅ 已合并 |
| P1 | D1: isDirectExecution 对称性 | [#341](https://github.com/madlouse/AgenticOS/pull/341) | ✅ 已合并 |
| P1 | D2: process.exit 移除 | [#337](https://github.com/madlouse/AgenticOS/pull/337)（同 D3 PR） | ✅ 已合并 |
| P1 | D5: 版本间回归测试 | [#337](https://github.com/madlouse/AgenticOS/pull/337)（D3 覆盖） | ✅ 已合并 |
| P2 | D7: MCP transport 健康检查 | [#340](https://github.com/madlouse/AgenticOS/pull/340) | ✅ PR 待合并 |
| P2 | D6: formula URL 版本号 | v0.4.7 formula 已使用 `agenticos-mcp-0.4.7.tgz` | ✅ 已在 v0.4.7 修复 |

### PR 汇总

- [#337](https://github.com/madlouse/AgenticOS/pull/337): `feat(mcp-server): add MCP transport lifecycle integration tests`
  - 新增 `mcp-transport.integration.test.ts`（4 个集成测试）
  - 修复 Bug #333（移除 `.then(process.exit)`）
- [#338](https://github.com/madlouse/AgenticOS/pull/338): `feat(ci): add symlink installation path test`
  - CI 新增 `mcp-symlink-integration` job
- [#340](https://github.com/madlouse/AgenticOS/pull/340): `feat(mcp-server): add mcp_transport health gate`
  - `agenticos_health` 新增 `mcp_transport` gate
- [#341](https://github.com/madlouse/AgenticOS/pull/341): `fix(mcp-server): resolve symlinks symmetrically on both sides`
  - `isDirectExecution` 两端均用 `realpathSync` 对称解析
