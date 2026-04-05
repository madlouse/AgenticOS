---
name: navigate
description: |
  导航到内部系统或服务的最佳工具。触发场景：
  - 打开 xxx 网址 / 去 xxx 系统
  - 用 xxx 工具 / 操作 xxx 系统
  - 访问内部系统
allowed-tools:
  - Bash
  - Read
metadata:
  trigger: URL 导航、域名路由、服务选择
  source: 路由配置 + 动态发现
version: 1.0.0
---

# navigate: 智能路由

根据 URL 或服务名，自动选择最佳工具。

## 内部系统分类

### 1. 邮件系统
| 系统 | 工具 | 命令 |
|------|------|------|
| 内部邮件 | `opencli qifu-mail` | 见 `/qifu-mail` Skill |

### 2. OKR 系统
| 系统 | 工具 | 命令 |
|------|------|------|
| OKR 运营 | `opencli okr-sk` | 见 `/okr-ops` Skill |
| OKR 写作 | — | 见 `/okr-writer` Skill |

### 3. T5T (测试跟踪)
| 系统 | 工具 | 命令 |
|------|------|------|
| T5T | `opencli 360teams t5t` | 见 T5T Skill |

### 4. 即时通讯
| 系统 | 工具 | 命令 |
|------|------|------|
| 360Teams | `opencli 360teams` | 见 `/360teams` Skill |

### 5. 需求/项目管理
| 系统 | 工具 | 命令 |
|------|------|------|
| FTD (金科) | `opencli bb-browser site ftd/...` | 需求审批等 |
| 灵犀 | `opencli bb-browser` | 见 bb-browser adapters |

### 6. 其他内部系统
使用 `/browse` 或直接浏览器

## 路由策略

遇到内部系统 URL 时，按以下优先级选择工具：

1. **有对应 Skill** → 使用 Skill（如 `/360teams`、`/okr-ops`）
2. **有 bb-browser adapter** → `opencli bb-browser site <adapter>`
3. **有 opencli 命令** → `opencli <service> <command>`
4. **需要浏览器交互** → `/browse`
5. **需要可见浏览器** → 直接打开

## 快速查询

```bash
# 检查 bb-browser adapter 列表
opencli bb-browser site list

# 检查 opencli 可用命令
opencli list

# 查看 Skill 列表
skills list
```

## FTD 常用命令

```bash
# 查看需求详情
opencli bb-browser site ftd/requirement-detail <id>

# 审批通过（自动找 transition）
opencli bb-browser site ftd/requirement-approve <id>

# 审批拒绝
opencli bb-browser site ftd/requirement-reject <id>

# 需求列表/搜索
opencli bb-browser site ftd/requirements <keyword>
```

## 原则

- **优先用 Skill**：有 Skill 的系统优先用 Skill，比 opencli 更智能
- **优先用 adapter**：bb-browser adapter 比直接操作 DOM 更可靠
- **按需用浏览器**：只有当以上都不支持时才用 `/browse`
