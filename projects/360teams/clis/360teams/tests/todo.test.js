import { describe, expect, it, vi } from 'vitest';
import {
  parseTodoFromText,
  truncate,
  formatWaiting,
} from '../todo.js';

// ─── parseTodoFromText ───────────────────────────────────────────────────────

describe('parseTodoFromText', () => {
  it('returns empty array for null', () => {
    expect(parseTodoFromText(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseTodoFromText('')).toEqual([]);
  });

  it('parses a single todo item (title, status, from)', () => {
    const text = [
      '采购申请-Q1办公用品',
      '审批中',
      '张三',
      '2026-03-01',
      '3天',
    ].join('\n');
    const result = parseTodoFromText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      index: 1,
      title: '采购申请-Q1办公用品',
      status: '审批中',
      from: '张三',
      arrived: '2026-03-01',
      waiting: '3天',
    });
  });

  it('parses multiple items', () => {
    const text = [
      '第一项',
      '审批中',
      '人员A',
      '2026-03-01',
      '1天',
      '第二项',
      '待处理',
      '人员B',
      '2026-03-02',
      '2天',
    ].join('\n');
    const result = parseTodoFromText(text);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('第一项');
    expect(result[1].title).toBe('第二项');
  });

  it('filters out noise lines (导航项、日历、标题)', () => {
    const text = [
      '消息',
      '待办',
      'T5T',
      '日程会议',
      '审批',
      '周日',
      '张三',
      '不相关内容',
    ].join('\n');
    expect(parseTodoFromText(text)).toEqual([]);
  });

  it('does not treat noise as status when next line is not a status keyword', () => {
    const text = '日程会议\n普通文本\n审批';
    expect(parseTodoFromText(text)).toEqual([]);
  });

  it('marks overtime false for non-overtime items', () => {
    const text = '测试标题\n审批中\n提交人\n到达时间\n等待时间';
    const [item] = parseTodoFromText(text);
    expect(item.overtime).toBe(false);
  });

  it('strips whitespace from each line', () => {
    const text = '  标题  \n  审批中  \n  来源  \n  时间1  \n  时间2  ';
    const [item] = parseTodoFromText(text);
    expect(item.title).toBe('标题');
    expect(item.status).toBe('审批中');
  });

  it('handles status keyword variants', () => {
    const variants = ['审批中', '待处理', '审核中', '待审批'];
    variants.forEach((status) => {
      const text = `标题\n${status}\n来源\n时间1\n时间2`;
      const result = parseTodoFromText(text);
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(status);
    });
  });
});

// ─── truncate ────────────────────────────────────────────────────────────────

describe('truncate', () => {
  it('returns empty string for null input', () => {
    expect(truncate(null)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(truncate(undefined)).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(truncate('')).toBe('');
  });

  it('returns unchanged string shorter than maxLen (default 16)', () => {
    expect(truncate('短文本')).toBe('短文本');
  });

  it('truncates string longer than default 16 chars', () => {
    // '这是一个非常长的标题内容' is 12 Chinese chars (> 16 bytes but same string length)
    const long = '12345678901234567'; // 17 chars > 16
    // slice(0, 15) = first 15 chars + '…' = 16 chars total
    const result = truncate(long);
    expect(result).toBe('123456789012345…'); // 15 digits + ellipsis
    expect(result.length).toBe(16);
  });

  it('returns unchanged at exactly 16 chars (no truncation)', () => {
    const text = '1234567890123456'; // 16 chars, not > 16
    expect(truncate(text, 16)).toBe(text);
  });

  it('returns unchanged when shorter than maxLen', () => {
    const text = '123456789012345'; // 15 chars
    expect(truncate(text, 16)).toBe(text);
  });

  it('respects custom maxLen', () => {
    expect(truncate('ABCDEFGHIJ', 8)).toBe('ABCDEFG…');
  });

  it('custom maxLen of 1 truncates to 0 chars + ellipsis', () => {
    // 3 > 1, so slice(0, 0) + '…' = '…'
    expect(truncate('ABC', 1)).toBe('…');
  });

  it('custom maxLen of 0 returns unchanged (length not > 0)', () => {
    // 'anything'.length = 8, 8 > 0 is true → slice(0, -1) + '…' = 'anythin…'
    expect(truncate('anything', 0)).toBe('anythin…');
  });
});

// ─── formatWaiting ────────────────────────────────────────────────────────────

describe('formatWaiting', () => {
  it('returns empty string when waiting is falsy', () => {
    expect(formatWaiting('', false)).toBe('');
    expect(formatWaiting(null, false)).toBe('');
    expect(formatWaiting(undefined, false)).toBe('');
  });

  it('returns waiting string as-is when overtime is false', () => {
    expect(formatWaiting('3天', false)).toBe('3天');
    expect(formatWaiting('2小时', false)).toBe('2小时');
  });

  it('prepends warning emoji when overtime is true', () => {
    expect(formatWaiting('3天', true)).toBe('⚠️ 3天');
    expect(formatWaiting('5小时', true)).toBe('⚠️ 5小时');
  });

  it('returns empty string for empty waiting regardless of overtime flag', () => {
    expect(formatWaiting('', true)).toBe('');
  });
});
