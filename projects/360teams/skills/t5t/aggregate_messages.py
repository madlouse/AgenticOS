#!/usr/bin/env python3
"""
T5T 消息汇总脚本（通用版）
将各成员的私聊消息文件合并为一个汇总文件，供大模型分析。

设计原则：
- 本脚本不做任何"周报识别"判断，只做原始消息的汇总
- 周报识别由大模型（Skills 执行时的 Claude）完成
- 通用：适用于任何周（W13/W14/W15...）

用法：python3 aggregate_messages.py [raw-materials-dir]
输出：{raw-materials-dir}/messages-all.md

消息格式说明：
- TextMessage: 纯文本，Content 为字符串
- RichTextMessage: 富文本，已转换为 Markdown（通过 collect_messages.py）
- 链接/图片等: 以 [类型] 格式标注
"""

import os
import sys
from datetime import datetime

# 成员文件映射（不含本人，本人私聊消息通常为空）
FILENAME_MAP = {
    "01-nisryong": "倪思勇",
    "02-zhangwanxue": "张婉雪",
    "03-leichaiwei": "雷柴卫",
    "04-guogaosheng": "郭高升",
    "05-huangjunlin": "黄俊林",
    "06-liuliying": "刘立影",
    "07-zhangjiaxu": "张嘉旭",
}


def main():
    if len(sys.argv) >= 2:
        raw_dir = sys.argv[1]
    else:
        base = "/Users/jeking/dev/AgenticOS/projects/t5t"
        candidates = sorted(
            [d for d in os.listdir(base) if d.startswith("Week-")],
            reverse=True
        )
        if not candidates:
            print("未找到 Week-* 目录")
            sys.exit(1)
        raw_dir = os.path.join(base, candidates[0], "raw-materials")

    print(f"原始素材目录: {raw_dir}")

    output_lines = [
        f"# 团队消息汇总\n",
        f"> 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n",
        f"> 说明：本文件包含各成员最近3天的私聊原始消息，供大模型识别周报使用。\n",
        f"> 周报特征：包含本周工作进展 + 下周计划，通常是较长的结构化消息。\n\n",
    ]

    total_messages = 0
    members_found = 0

    for fname, pname in FILENAME_MAP.items():
        fpath = os.path.join(raw_dir, f"{fname}.md")
        if not os.path.exists(fpath):
            print(f"[{pname}] 文件不存在，跳过")
            continue

        with open(fpath, encoding="utf-8") as f:
            content = f.read().strip()

        if not content or content == f"# {pname}".split("（")[0]:
            print(f"[{pname}] 文件为空，跳过")
            continue

        # 统计消息数量
        msg_count = content.count("\n## ")
        total_messages += msg_count
        members_found += 1

        output_lines.append(f"---\n\n## 📌 {pname} 的消息（共 {msg_count} 条）\n\n")
        output_lines.append(content)
        output_lines.append("\n\n")
        print(f"[{pname}] ✅ {msg_count} 条消息")

    output_path = os.path.join(raw_dir, "messages-all.md")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(output_lines))

    print(f"\n✅ 完成: {members_found} 人，共 {total_messages} 条消息")
    print(f"输出: {output_path}")
    print(f"\n⬆️ 请大模型读取以上文件，从每人消息中识别本周周报（含本周进展+下周计划的那条）")


if __name__ == "__main__":
    main()
