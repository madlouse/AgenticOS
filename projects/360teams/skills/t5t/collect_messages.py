#!/usr/bin/env python3
"""
T5T 私聊消息收集脚本
健壮版本：逐人读取 + JSON解析 + 出错隔离

用法：python3 collect_messages.py [raw-materials-dir] [days-back]
默认：raw-materials-dir = projects/t5t/Week-YYYY-MM-N/raw-materials
      days-back = 3（周报通常在周四/周五/周六发送，3天覆盖即可）
"""

import json
import subprocess
import sys
import os
import re
from datetime import datetime, timedelta

# 成员名单（与 SKILL.md 同步）
MEMBERS = [
    ("黄建庭（本人）", "MDEP000048"),
    ("倪思勇",        "MDEP000321"),
    ("张婉雪",        "MDEP000266"),
    ("雷柴卫",        "MDEP002429"),
    ("郭高升",        "MDEP004077"),
    ("黄俊林",        "MDEP020659"),
    ("刘立影",        "MDEP022501"),
    ("张嘉旭",        "MDEP025219"),
]


def _format_text(text, attrs):
    """对文本应用加粗/斜体样式。"""
    if not isinstance(attrs, dict):
        attrs = {}
    if attrs.get("bold"):
        text = "**" + text + "**"
    if attrs.get("italic"):
        text = "_" + text + "_"
    return text


def _number_prefix(stripped_text):
    """检测文本是否以列表编号开头（1.  1、  1)  1．等）。

    返回 (编号数字int或None, 去掉编号前缀后的文本)。
    编号后必须是标点符号（. 、 ））+空格，不能是字母/数字。
    排除 "0402 版本" 这类版本号格式。
    """
    # 匹配 "1. xxx" 或 "1、xxx" 或 "1) xxx"
    # 编号(digits) + 标点(.、、)) + 空格 + 内容
    m = re.match(r'^(\d+)([.)、．]+)\s+(.*)$', stripped_text)
    if m:
        num_str, sep, rest = m.group(1), m.group(2), m.group(3)
        # rest 第一个字符不能是字母或数字（排除版本号）
        if rest and not rest[0].isdigit() and not rest[0].isalpha():
            return int(num_str), rest
    # 全角数字 １.
    m = re.match(r'^(\d＋)([.)、．]+)\s+(.*)$', stripped_text)
    if m:
        num_str, sep, rest = m.group(1), m.group(2), m.group(3)
        if rest and not rest[0].isdigit() and not rest[0].isalpha():
            return int(num_str.replace('＋', '')), rest
    return None, stripped_text


def extract_rich_text_as_markdown(delta):
    """将 Quill Delta 数组转换为 Markdown 文本（完整保留原始格式）。

    Quill Delta 标准格式（RFC）：
    - 每个 op 是 {"insert": ..., "attributes": {}}
    - 内联文本：{"insert": "文本", "attributes": {"bold": true}}
    - 行终止符：{"insert": "\n", "attributes": {"list": "bullet"}}
      ← list 属性在 \n op 上，表示这一行是列表项
      ← \n 前面积累的文本就是该列表项的内容

    算法：
    1. 用 current_line 积累当前行的 inline 文本
    2. 遇到 insert == "\n" 时，检查 attrs.get("list")
       - "bullet"  → 输出 "• {current_line}\n"，清空
       - "ordered" → 输出 "N. {current_line}\n"，清空，计数器+1
       - 无 list   → 输出 "{current_line}\n"，清空，有序计数器归零
    3. 遇到 insert 中含 \n 的字符串（多段落文本）→ 按 split("\n") 处理
    """
    if not isinstance(delta, list):
        return ""

    result = []
    current_line = []   # 当前行的 inline 片段
    ordered_counter = 0

    for block in delta:
        if not isinstance(block, dict):
            continue

        insert = block.get("insert", "")
        attrs = block.get("attributes", {})
        if not isinstance(attrs, dict):
            attrs = {}

        if not isinstance(insert, str):
            # 嵌入对象（图片等）跳过
            if isinstance(insert, (dict, list)):
                sub = extract_rich_text_as_markdown(insert if isinstance(insert, list) else [insert])
                current_line.append(sub)
            continue

        if insert == "\n":
            # 行终止符：根据 list 属性决定格式
            list_type = attrs.get("list")
            line_text = "".join(current_line)
            if list_type == "bullet":
                result.append("• " + line_text + "\n")
                ordered_counter = 0
            elif list_type == "ordered":
                ordered_counter += 1
                # 如果内容已有编号前缀，保留原样
                num, _ = _number_prefix(line_text)
                if num is not None:
                    result.append(line_text + "\n")
                else:
                    result.append(f"{ordered_counter}. " + line_text + "\n")
            else:
                result.append(line_text + "\n")
                ordered_counter = 0
            current_line = []

        elif "\n" in insert:
            # 文本中包含换行（多段落）
            parts = insert.split("\n")
            for j, part in enumerate(parts):
                if part:
                    current_line.append(_format_text(part, attrs))
                if j < len(parts) - 1:
                    # 内部普通换行
                    result.append("".join(current_line) + "\n")
                    current_line = []
                    ordered_counter = 0

        else:
            # 普通内联文本
            current_line.append(_format_text(insert, attrs))

    # 输出末尾未终止的内容
    if current_line:
        result.append("".join(current_line))

    text = "".join(result)
    # 清理连续空行（三连空→两连空）
    while "\n\n\n" in text:
        text = text.replace("\n\n\n", "\n\n")
    return text


def get_date_filter(days_back=3):
    """返回日期过滤边界 datetime 对象（最近 N 天）。"""
    return datetime.now() - timedelta(days=days_back)


def parse_message(item, my_id, cutoff):
    """解析单条消息，返回 (time, text, msg_type, raw_len) 或 None。"""
    sender = item.get("Sender", "")
    if sender != my_id:
        return None

    msg_type = item.get("Type", "")
    time_str = item.get("Time", "")

    # 日期过滤
    try:
        date_part = time_str.split(",")[0]
        year = int(date_part.split("/")[2])
        month = int(date_part.split("/")[0])
        day = int(date_part.split("/")[1])
        msg_date = datetime(year, month, day)
        if msg_date < cutoff:
            return None
    except Exception:
        return None

    # 根据类型提取文本（保留完整原始内容，不精简）
    if msg_type == "RichTextMessage":
        delta = item.get("Content", [])
        if isinstance(delta, list) and len(delta) > 0:
            text = extract_rich_text_as_markdown(delta)
            raw_len = len(json.dumps(delta, ensure_ascii=False))
        else:
            text = str(delta) if delta else ""
            raw_len = len(str(delta))
        if not text or len(text.strip()) < 2:
            return None

    elif msg_type == "TextMessage":
        text = item.get("Content", "")
        if isinstance(text, str):
            raw_len = len(text)
        else:
            raw_len = len(str(text))
            text = str(text)
        if not text or len(text.strip()) < 2:
            return None

    elif msg_type == "ImageMessage":
        text = "[图片]"
        raw_len = 0

    elif msg_type == "ReferenceMessage":
        content = item.get("Content", {})
        if isinstance(content, dict):
            title = content.get("ogTitle", "") or content.get("ogUrl", "") or "链接"
            url = content.get("ogUrl", "") or content.get("content", "")
            text = f"[链接: {title}]({url})" if url else f"[链接: {title}]"
        else:
            text = "[链接消息]"
        raw_len = len(str(content))

    elif msg_type == "SKOgUrlMsg":
        url = item.get("Content", "")
        text = f"[链接]({url})" if url else "[链接]"
        raw_len = len(str(url))

    elif msg_type == "RecallCommandMessage":
        text = "[已撤回]"
        raw_len = 0

    elif msg_type == "RCCombineMessage":
        text = "[合并消息]"
        raw_len = 0

    elif msg_type == "FileMessage":
        text = "[文件消息]"
        raw_len = 0

    else:
        raw = json.dumps(item, ensure_ascii=False)
        print(f"    ⚠️ 未知消息类型: {msg_type}，内容: {raw[:200]}")
        text = ""
        raw_len = 0
        return None

    return time_str, text, msg_type, raw_len


def collect_for_member(name, member_id, output_dir, days_back=3):
    """获取单个成员的私聊消息，写入 Markdown 文件。"""
    cutoff = get_date_filter(days_back)

    try:
        result = subprocess.run(
            ["opencli", "360teams", "read",
             "--target", member_id,
             "--limit", "200",
             "-f", "json"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        raw = result.stdout.strip()
        if not raw:
            print(f"[{name}] CLI 返回为空")
            return False

        if not raw.startswith("["):
            raw = "[" + raw + "]"
        data = json.loads(raw)

    except subprocess.TimeoutExpired:
        print(f"[{name}] CLI 超时")
        return False
    except json.JSONDecodeError as e:
        print(f"[{name}] JSON 解析失败: {e}")
        return False
    except Exception as e:
        print(f"[{name}] CLI 执行失败: {e}")
        return False

    # 解析消息
    messages = []
    for item in data:
        parsed = parse_message(item, member_id, cutoff)
        if parsed:
            messages.append(parsed)

    # 写文件
    filename_map = {
        "倪思勇": "01-nisryong",
        "张婉雪": "02-zhangwanxue",
        "雷柴卫": "03-leichaiwei",
        "郭高升": "04-guogaosheng",
        "黄俊林": "05-huangjunlin",
        "刘立影": "06-liuliying",
        "张嘉旭": "07-zhangjiaxu",
    }
    key = name.replace("（本人）", "")
    filename = filename_map.get(key, key)
    filepath = os.path.join(output_dir, f"{filename}.md")

    type_label = {
        "TextMessage": "文字",
        "RichTextMessage": "富文本",
        "ImageMessage": "图片",
        "ReferenceMessage": "链接",
        "SKOgUrlMsg": "链接",
        "RecallCommandMessage": "已撤回",
        "RCCombineMessage": "合并",
        "FileMessage": "文件",
    }

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"# {name} ({member_id}) - 私聊消息\n\n")
        for time_str, text, msg_type, raw_len in messages:
            label = type_label.get(msg_type, msg_type)
            f.write(f"## {time_str} [{label}]\n\n{text}\n\n---\n\n")

    print(f"[{name}] ✅ {len(messages)} 条消息 → {filepath}")
    return True


def main():
    if len(sys.argv) >= 2:
        output_dir = sys.argv[1]
    else:
        week_dir = datetime.now().strftime("Week-%Y-%m-W")
        base = "/Users/jeking/dev/AgenticOS/projects/t5t"
        candidates = sorted([d for d in os.listdir(base) if d.startswith("Week-2026-03-")], reverse=True)
        if candidates:
            week_dir = candidates[0]
        output_dir = os.path.join(base, week_dir, "raw-materials")

    days_back = int(sys.argv[2]) if len(sys.argv) >= 3 else 3

    os.makedirs(output_dir, exist_ok=True)
    print(f"输出目录: {output_dir}")
    print(f"收集范围: 最近 {days_back} 天\n")

    success = 0
    for name, member_id in MEMBERS:
        if collect_for_member(name, member_id, output_dir, days_back):
            success += 1

    print(f"\n完成: {success}/{len(MEMBERS)} 人")


if __name__ == "__main__":
    main()
