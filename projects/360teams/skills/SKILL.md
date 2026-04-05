---
name: 360Teams
description: |
  使用 360Teams 即时通讯。触发场景：
  - 发 Teams 消息给 xxx / 发一条360Teams给xxx说xxx
  - 收 Teams 消息 / Teams有什么新消息 / 读xxx的消息
  - 查 Teams 联系人 / Teams联系人里有没有xxx
  - 查 Teams 群组 / 发群消息
allowed-tools:
  - Bash
metadata:
  trigger: 收发 360Teams 消息、查询联系人或群组
  source: opencli 360teams CLI
version: 2.1.0
---

# 360Teams Skill

通过 `opencli 360teams` 访问 360Teams 即时通讯。

**前提：** 无需手动启动。执行任何命令时，若 360Teams 未以调试模式运行，会自动重启并开启 CDP 端口。

## 命令参考

```
opencli 360teams status                                          # 检查连通状态
opencli 360teams me                                              # 当前登录用户（24h 缓存）
opencli 360teams search --name <关键词> [--limit N]              # 按姓名搜联系人 → 获取 ID（1h 缓存）
opencli 360teams contacts [--limit N] [--refresh true]           # 全量联系人（默认50条，1h 缓存）
opencli 360teams conversations [--limit N]                       # 最近会话含未读数（默认20条）
opencli 360teams groups [--refresh true]                         # 群组列表（1h 缓存）
opencli 360teams send --to <ID> --msg <text> [--type GROUP]      # 发消息
opencli 360teams read --target <ID> [--limit N] [--type GROUP]   # 读消息历史（默认20条）
```

## 输出列

| 命令 | 列 |
|------|----|
| search / contacts | ID, Name, Mobile, Department |
| conversations | Type, TargetId, Title, Unread, LastMessage |
| groups | ID, Name, MemberCount |
| read | Time, Sender, Type, Content |

## 组合原则

需要某人 ID → 先用 `search --name <姓名>`（走缓存，极快）。找不到 → `conversations --limit 50` 从 Title 列找。需要群 ID → `groups`。查未读 → `conversations`，看 Unread > 0 的行。

## 缓存说明

| 数据 | TTL | 强制刷新 |
|------|-----|----------|
| me（当前用户） | 24h | 重新运行即可 |
| contacts / search | 1h | `--refresh true` |
| groups | 1h | `--refresh true` |
| conversations / read | 不缓存 | — |

## 错误处理

| 错误 | 解决 |
|------|------|
| 360Teams app not found | 请先安装 360Teams |
| CDP port not ready after 30s | 手动启动：`open -a "360teams" --args --remote-debugging-port=9234` |
| No contacts found matching | 换关键词，或改用 conversations 查 |
| send failed | 确认 ID 正确；群消息需加 --type GROUP |
