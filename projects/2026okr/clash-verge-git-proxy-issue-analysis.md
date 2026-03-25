# Clash Verge + Git 内网访问超时问题分析

> 日期：2026-01-09
> 问题：Claude Code 更新插件时，Git 克隆公司 GitLab 仓库失败

---

## 一、问题现象

### 1.1 错误信息

**Clash Verge 日志：**
```
[TCP] dial DIRECT (match IPCIDR/10.0.0.0/8) 127.0.0.1:51037(git-remote-http)
--> gitlab.daikuan.qihoo.net:443 error: connect failed: dial tcp 10.185.163.45:443: i/o timeout
```

**Git 错误：**
```
fatal: unable to access 'https://gitlab.daikuan.qihoo.net/jinke-ai/jone-plugins.git/':
LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to gitlab.daikuan.qihoo.net:443
```

### 1.2 关键线索提取

| 线索 | 含义 |
|------|------|
| `match IPCIDR/10.0.0.0/8` | Clash 规则匹配到内网 IP 段 |
| `DIRECT` | 规则指定走直连（不经过代理节点） |
| `10.185.163.45:443` | GitLab 解析到公司内网 IP |
| `i/o timeout` | 直连内网 IP 超时 |
| `git-remote-http` | 请求来自 git 的 HTTP 传输进程 |

---

## 二、问题根因分析

### 2.1 比喻说明

想象你要寄一封信到公司内部（内网地址 `10.185.163.45`）。

你有两种寄信方式：
- **方式A（TUN模式）**：直接走公司专用通道，信件自动送达
- **方式B（HTTP代理）**：先把信交给门口的快递小哥（Clash代理），让他帮你转发

**curl** 用的是方式A，直接走专用通道，没问题。

**git** 被配置成用方式B，要经过快递小哥。但快递小哥（Clash代理进程）自己不在公司内网里，他没法"直连"到内网地址。

### 2.2 技术流程对比

**失败路径 - Git 走 HTTP 代理：**
```
Git
 → Clash HTTP代理 (127.0.0.1:7897)
   → DNS解析得到 10.185.163.45
     → 规则匹配 "IP-CIDR,10.0.0.0/8,DIRECT"
       → Clash进程尝试直连内网
         → ❌ 超时（Clash进程不在内网）
```

**成功路径 - curl 走 TUN 模式：**
```
curl
 → TUN虚拟网卡
   → 你的电脑（连着公司VPN）
     → 直接访问内网
       → ✅ 成功
```

### 2.3 根因确认

检查 Git 全局配置：
```bash
$ git config --global --list | grep proxy
http.proxy=http://127.0.0.1:7897
https.proxy=http://127.0.0.1:7897
```

**结论：Git 配置了 HTTP 代理指向 Clash，导致内网请求走了错误的路径。**

---

## 三、修复措施

### 3.1 核心修复（必做）

为公司 GitLab 域名禁用 Git 代理：

```bash
git config --global http.https://gitlab.daikuan.qihoo.net/.proxy ""
```

**原理**：告诉 Git 访问 `gitlab.daikuan.qihoo.net` 时不使用代理，直接走 TUN 模式。

### 3.2 额外保险措施（可选）

#### 3.2.1 添加 Clash 域名规则

编辑规则配置文件 `profiles/rVG2uzT9ntEJ.yaml`：
```yaml
prepend:
  - 'DOMAIN-SUFFIX,daikuan.qihoo.net,DIRECT'  # 新增，放在最前面
  - 'DOMAIN,antigravity.google,DIRECT'
  # ... 其他规则
```

**原理**：域名规则优先于 IP-CIDR 规则匹配，确保该域名走直连。

#### 3.2.2 添加 DNS 策略

编辑 merge 配置文件 `profiles/mFoc9HS05cSs.yaml`：
```yaml
dns:
  nameserver-policy:
    +.daikuan.qihoo.net:
      - system  # 使用系统DNS解析，而非Clash的fake-ip
```

**原理**：确保域名通过系统 DNS 解析到真实内网 IP。

### 3.3 重载 Clash 配置

```bash
curl -X PUT --unix-socket /tmp/verge/verge-mihomo.sock \
  "http://localhost/configs?force=true" \
  -H "Authorization: Bearer 111111" \
  -H "Content-Type: application/json" -d '{}'
```

---

## 四、验证修复

```bash
# 测试 Git 能否访问 GitLab
$ git ls-remote https://gitlab.daikuan.qihoo.net/jinke-ai/jone-plugins.git HEAD
aab082329051a5481b06270b877d9cddd120c5d0	HEAD  # ✅ 成功
```

---

## 五、经验总结

### 5.1 核心口诀

> **curl 能通，工具不通 → 查工具自己的代理配置**

### 5.2 常见工具的代理配置位置

| 工具 | 检查命令 | 清除代理 |
|------|---------|---------|
| Git | `git config --global --list \| grep proxy` | `git config --global --unset http.proxy` |
| npm | `npm config get proxy` | `npm config delete proxy` |
| pip | `pip config list` | 编辑 `~/.pip/pip.conf` |
| 环境变量 | `env \| grep -i proxy` | `unset http_proxy https_proxy` |

### 5.3 诊断决策树

```
网络连接失败
│
├─ curl 测试成功？
│   ├─ 是 → 检查工具独立代理配置 ← 【本次问题】
│   └─ 否 → 继续排查
│
├─ ping 目标 IP 成功？
│   ├─ 是 → DNS 或代理规则问题
│   └─ 否 → 网络不通（检查VPN/防火墙）
│
└─ DNS 解析正常？
    ├─ 返回 fake-ip → 检查 Clash 规则
    └─ 返回真实 IP → 检查 TUN 模式
```

### 5.4 一句话总结

> Git 配了 HTTP 代理走 Clash，Clash 看到内网 IP 想直连，但 Clash 进程本身不在内网，所以超时。解决办法：让 Git 对内网地址不走代理。

---

## 六、相关文件

| 文件 | 路径 | 用途 |
|------|------|------|
| Clash 配置目录 | `~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/` | 所有配置文件 |
| 当前配置索引 | `profiles.yaml` | 记录当前使用的配置 |
| 最终生效配置 | `clash-verge.yaml` | Clash 实际使用的完整配置 |
| 规则配置 | `profiles/rVG2uzT9ntEJ.yaml` | 自定义规则 |
| Merge 配置 | `profiles/mFoc9HS05cSs.yaml` | DNS 等合并配置 |
| 诊断 Skill | `~/.claude/skills/network-proxy-diagnosis.md` | Claude Code 诊断指南 |
