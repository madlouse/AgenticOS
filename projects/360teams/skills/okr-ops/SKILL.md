---
name: OKR Ops
description: |
  This skill should be used when the user asks to operate on the OKR website directly:
  "查看OKR", "获取OKR内容", "更新OKR到网站", "把OKR写进去", "同步OKR",
  "发布OKR", "暂存OKR", "OKR周期列表", "看一下网站上的OKR",
  "帮我把这个OKR更新上去", "把v6同步到网站", "OKR网站上改一下",
  or when the user wants to read from or write to the OKR system at okr.sk.360shuke.com.
allowed-tools:
  - Bash
  - Read
  - Glob
metadata:
  trigger: 操作 OKR 网站（读取/写入/发布）
  tool: bb-browser site okr/*
version: 1.0.0
---

# OKR Ops Skill

通过 `bb-browser site okr/*` adapter 直接操作 OKR 网站，无需写代码，Agent 直接调用。

## 前提条件

bb-browser 已安装，且浏览器中已登录 `okr.sk.360shuke.com`。

## 可用操作

| 命令 | 用途 | 示例 |
|------|------|------|
| `bb-browser site okr/periods` | 列出所有周期 | `bb-browser site okr/periods` |
| `bb-browser site okr/get [周期]` | 获取 OKR 内容 | `bb-browser site okr/get 2026年年度` |
| `bb-browser site okr/update` | 更新某个 Objective（暂存） | 见下方参数说明 |
| `bb-browser site okr/publish [周期]` | 发布 OKR | `bb-browser site okr/publish 2026年年度` |

## 工作流程

### Step 1：读取当前 OKR

```bash
bb-browser site okr/get 2026年年度 --json
```

返回结构：
```json
{
  "period": "2026年年度",
  "periodId": 34,
  "objectives": [
    {
      "index": 1,
      "id": 143937,
      "name": "[O1]...",
      "krs": [
        {"index": 1, "id": 411524, "name": "KR1:...", "weight": "25%"}
      ]
    }
  ]
}
```

### Step 2：更新某个 Objective

```bash
bb-browser site okr/update \
  --period "2026年年度" \
  --obj_index 1 \
  --obj_name "[O1]新标题" \
  --krs '[{"name":"KR1:内容","weight":0.25},{"name":"KR2:内容","weight":0.25}]'
```

**参数说明：**
- `period`：周期名称（必填）
- `obj_index`：Objective 序号，从 1 开始（必填）
- `obj_name`：新的 Objective 标题（选填）
- `krs`：KR 数组 JSON，包含 `name` 和 `weight`（选填）
  - weight 为小数，如 25% = 0.25
  - KR 数量可以比现有多（自动创建新 KR）
  - KR 数量不能比现有少（多余的 KR 会保留）

### Step 3：逐个更新所有 Objective

```bash
# 更新 O1
bb-browser site okr/update --period "2026年年度" --obj_index 1 --obj_name "..." --krs '[...]'

# 更新 O2
bb-browser site okr/update --period "2026年年度" --obj_index 2 --obj_name "..." --krs '[...]'

# 更新 O3
bb-browser site okr/update --period "2026年年度" --obj_index 3 --krs '[...]'

# 更新 O4
bb-browser site okr/update --period "2026年年度" --obj_index 4 --krs '[...]'
```

### Step 4：确认后发布（可选）

```bash
bb-browser site okr/publish 2026年年度
```

## KR 权重规则

所有 KR 的 weight 之和必须 = 1.0，否则网站会报错。

| KR 数量 | 均分权重 |
|---------|---------|
| 2 | 0.5 / 0.5 |
| 3 | 0.333 / 0.333 / 0.334 |
| 4 | 0.25 / 0.25 / 0.25 / 0.25 |
| 5 | 0.2 × 5 |

自定义权重示例（4KR）：`[0.30, 0.25, 0.20, 0.25]`

## 注意事项

1. **暂存 ≠ 发布**：`update` 命令只暂存，不会自动发布。发布前可以在网站上人工确认内容。
2. **新增 KR**：如果 `krs` 数组比现有 KR 多，会自动调用 `addProcess` API 创建新 KR。
3. **不能删除 KR**：adapter 不支持删除 KR，只能增加或修改。
4. **多用户**：通过 `--user` 参数指定其他用户名，默认为 `huangjianting-jk`。

## 典型场景：从 Markdown 文件更新网站

当有一个写好的 OKR Markdown 文件（如 `2026年年度OKR-优化v6.md`）时：

1. 读取文件，解析每个 O 和 KR 的内容
2. 逐个调用 `bb-browser site okr/update` 更新
3. 验证：`bb-browser site okr/get 2026年年度` 确认内容正确
4. 确认无误后执行 `bb-browser site okr/publish`（或让用户手动发布）
