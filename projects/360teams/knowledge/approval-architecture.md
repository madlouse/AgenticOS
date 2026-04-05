# 360Teams 审批模块架构

## 页面结构

访问: `https://approval.sk.360shuke.com/hub?status=toDealt`

### 主要路由

| URL | 说明 |
|-----|------|
| `/hub?status=toDealt` | 待办列表 (默认) |
| `/hub?status=toLaunch` | 我发起的 |
| `/initiate` | 发起申请 |
| `/initiate/categoryId=xxx` | 特定分类的申请表单 |

## Vue 组件层级

```
approval.sk.360shuke.com (根)
├── .sidenav            # 侧边导航
│   └── .nav-item[data-type="calendar"]  # 日程会议
│   └── .nav-item[data-type="approval"]   # 审批入口
├── .hub-wrap           # 待办列表容器 (重要!)
│   └── vm.$data.tempData    # 待办数组
│   └── vm.cardClick(item)   # 点击回调
├── .hub-list-wrap      # 列表分页信息
│   └── vm.$data.count       # 分页总数 (数字，非数组)
├── .initiate-wrap      # 发起申请容器 (注意: 误用)
│   └── vm.$data.dataList    # 申请分类模板(9项)，不是待办!
└── iframe              # 详情页 iframe
```

## .hub-wrap 详解

`.hub-wrap` 是待办列表的主容器。找到它的 Vue 实例:

```javascript
var wraps = document.querySelectorAll('.hub-wrap');
for (var i = 0; i < wraps.length; i++) {
  var el = wraps[i];
  if (!el.__vue__) continue;
  var vm = el.__vue__;
  var d = vm['$data'];
  // d.tempData 数组即待办列表
}
```

### tempData 字段结构

```javascript
{
  taskSubject: "团建报销 - 张三",    // 或 title 字段
  status: 1,                         // 审批状态
  source: 1,                         // 来源(1=OA, 2=ITSM?)
  arrivalTime: "2026-03-31 10:00:00",
  // ... 其他字段
}
```

## .initiate-wrap 陷阱

`.initiate-wrap` 包含 `dataList` 数组(9项)，是**申请分类模板**，不是待办数据。不要将其误作待办来源。

## 导航流程

### 从侧边栏导航到待办

1. 点击侧边栏 "日程会议" 类型的 nav-item
2. 在下拉菜单中点击 "审批"
3. 页面跳转到 `/hub?status=toDealt` (待办 tab)

### 直接 URL 导航 (推荐)

由于 webview 状态不可控，直接导航到目标 URL 最可靠:

```javascript
await page.evaluate(
  "(function() { window.location.href = 'https://approval.sk.360shuke.com/hub?status=toDealt'; })()"
);
await sleep(5000); // 等待页面加载
```

## iframe 详情页

点击待办项后，右侧或新页面加载 iframe，内容通过 `cardClick(item)` 触发。iframe URL 通常包含审批详情。

### 获取 iframe 信息

```javascript
var iframeInfo = await page.evaluate(
  "(function() { " +
    "var iframes = document.querySelectorAll('iframe'); " +
    "for (var i = 0; i < iframes.length; i++) { " +
      "var f = iframes[i]; " +
      "var src = f.src || ''; " +
      "if (src.indexOf('approval') !== -1 || src.indexOf('taskId') !== -1) { " +
        "return 'iframe:' + src.slice(0, 100); " +
      "} " +
    "} " +
    "return 'no-iframe'; " +
  "})()"
);
```

## 按钮组 (区分 OA vs 工单)

详情页的按钮组用于区分待办类型:

| 按钮文案 | 类型 |
|---------|------|
| 批准 / 退回 / 转发 | OA 审批流 |
| 同意 / 驳回 / 指派 | ITSM 工单 |

按钮通常在 iframe 内或详情面板中。
