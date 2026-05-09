# #361 实现：On-Switch 自动适配机制

## 问题

当 AgenticOS 标准套件升级后，存量项目的配置/模板可能落后于最新规范。当前需要手动调用 `agenticos_standard_kit_adopt`，用户可能忽略。

## 目标

在 `agenticos_switch` 时自动检测并修复配置差异：

1. **On-Switch 时检测**：切换项目时自动检测配置版本差
2. **配置类差异自动修复**：模板版本差、缺失文件等直接自动修复
3. **流程类差异报告**：通过 bootstrapNotes 报告，不阻塞

## 实现方案

### 修改文件

1. **`mcp-server/src/tools/project.ts`** - switchProject 函数
   - 在切换完成后调用 adoptStandardKit
   - 通过 bootstrapNotes 报告检测结果

2. **`mcp-server/src/utils/standard-kit.ts`** - checkStandardKitUpgrade 函数
   - 扩展返回类型，标记 auto_fixable 项

### 核心逻辑

```
switchProject(project):
  ├─► 绑定 session project
  ├─► 检测版本差
  │     └─► 如果 stale 且可写 → adoptStandardKit()
  ├─► 检测 missing_required_files
  │     └─► 如果缺失 → adoptStandardKit()
  └─► 返回切换结果 + bootstrapNotes 摘要
```

## 验收标准

- [ ] switch 到项目时自动检测并修复 stale 模板
- [ ] canonical main 保护正常工作
- [ ] bootstrapNotes 包含升级摘要
- [ ] 所有测试通过
