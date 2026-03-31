import { describe, expect, it } from 'vitest';
import { parseT5THistoryFromText, extractT5TStatusFromText } from '../t5t.js';

// ── parseT5THistoryFromText ──────────────────────────────────────────────────

describe('parseT5THistoryFromText', () => {
  const singleWeekText = [
    '2026年3月第4周',
    '',
    '(2026年03月21日 01:02)',
    '修改',
    '1',
    '新机构交付：内容一。',
    '2',
    '常熟银行AI信贷员：内容二。',
    '3',
    '全流程质量加固：内容三。',
    '4',
    'Agentic研发效能：内容四。',
    '5',
    'DB资源回收：内容五。',
    '评论',
    '0',
  ].join('\n');

  it('parses all 5 items from a single week', () => {
    const records = parseT5THistoryFromText(singleWeekText);
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe('2026年3月第4周');
    expect(records[0].time).toBe('2026年03月21日 01:02');
    const items = records[0].content.split('；');
    expect(items).toHaveLength(5);
    expect(items[4]).toContain('DB资源回收');
  });

  it('does not drop 5th item when followed by noise line', () => {
    const text = [
      '2026年3月第4周',
      '(2026年03月21日 01:02)',
      '1', 'Item one',
      '2', 'Item two',
      '3', 'Item three',
      '4', 'Item four',
      '5', 'Item five',
      '评论',
      '0',
    ].join('\n');
    const records = parseT5THistoryFromText(text);
    const items = records[0].content.split('；');
    expect(items).toHaveLength(5);
    expect(items[4]).toBe('Item five');
  });

  it('parses multiple weeks', () => {
    const text = [
      '2026年3月第4周',
      '(2026年03月21日 01:02)',
      '1', 'A1',
      '2', 'A2',
      '3', 'A3',
      '4', 'A4',
      '5', 'A5',
      '评论', '0',
      '2026年3月第3周',
      '(2026年03月13日 22:26)',
      '1', 'B1',
      '2', 'B2',
      '3', 'B3',
      '4', 'B4',
      '5', 'B5',
      '评论', '0',
    ].join('\n');
    const records = parseT5THistoryFromText(text);
    expect(records).toHaveLength(2);
    expect(records[0].title).toBe('2026年3月第4周');
    expect(records[1].title).toBe('2026年3月第3周');
  });

  it('respects limit parameter', () => {
    const text = [
      '2026年3月第4周', '1', 'A',
      '2026年3月第3周', '1', 'B',
      '2026年3月第2周', '1', 'C',
    ].join('\n');
    const records = parseT5THistoryFromText(text, 2);
    expect(records).toHaveLength(2);
  });

  it('returns empty array for empty text', () => {
    expect(parseT5THistoryFromText('')).toEqual([]);
  });

  it('returns empty array for noise-only text', () => {
    expect(parseT5THistoryFromText('T5T\n筛选\n写T5T')).toEqual([]);
  });

  it('extracts time from parenthesized date', () => {
    const text = '2026年3月第4周\n(2026年03月21日 01:02)\n1\nContent here';
    const records = parseT5THistoryFromText(text);
    expect(records[0].time).toBe('2026年03月21日 01:02');
  });

  it('filters noise lines like 修改 and 评论', () => {
    const text = [
      '2026年3月第4周',
      '修改',
      '1', 'Real content',
      '评论', '0',
    ].join('\n');
    const records = parseT5THistoryFromText(text);
    expect(records[0].content).toBe('Real content');
    expect(records[0].content).not.toContain('修改');
    expect(records[0].content).not.toContain('评论');
  });

  it('handles items with numbered prefix format (1.、2.)', () => {
    const text = [
      '2026年3月第1周',
      '1.  First item',
      '2.  Second item',
    ].join('\n');
    const records = parseT5THistoryFromText(text);
    expect(records[0].content).toContain('First item');
  });

  it('preserves content with **bold** markers', () => {
    const text = [
      '2026年3月第4周',
      '1', '**Topic**：detail',
      '2', 'Plain item',
    ].join('\n');
    const records = parseT5THistoryFromText(text);
    expect(records[0].content).toContain('**Topic**');
  });

  it('handles names list after content without crashing', () => {
    const text = [
      '2026年3月第3周',
      '1', 'Content',
      '评论', '0',
      '彭新荣、', '郭高升、', '宋荣鑫、',
    ].join('\n');
    const records = parseT5THistoryFromText(text);
    expect(records).toHaveLength(1);
    // Names with trailing 、 pass through noise filter (known pre-existing behavior)
    expect(records[0].content).toContain('Content');
  });
});

// ── extractT5TStatusFromText ─────────────────────────────────────────────────

describe('extractT5TStatusFromText', () => {
  it('detects 未填写 status', () => {
    const text = '2026年3月第4周\n您还未填写\n已提交\n未提交';
    const [row] = extractT5TStatusFromText(text);
    expect(row.Status).toBe('未填写');
    expect(row.Week).toBe('2026年3月第4周');
  });

  it('detects 待填写 status', () => {
    const [row] = extractT5TStatusFromText('立即填写');
    expect(row.Status).toBe('待填写');
  });

  it('detects 已填写 status', () => {
    const [row] = extractT5TStatusFromText('已填写');
    expect(row.Status).toBe('已填写');
  });

  it('defaults to 未知 status', () => {
    const [row] = extractT5TStatusFromText('random text');
    expect(row.Status).toBe('未知');
  });

  it('counts submit and unsubmit occurrences', () => {
    const text = '已提交\n已提交\n已提交\n未提交\n未提交';
    const [row] = extractT5TStatusFromText(text);
    expect(row.Content).toBe('团队: 3人已提交, 2人未提交');
  });

  it('uses 当前周期 when no week found', () => {
    const [row] = extractT5TStatusFromText('no week here');
    expect(row.Week).toBe('当前周期');
  });

  it('always returns empty SubmitTime', () => {
    const [row] = extractT5TStatusFromText('2026年3月第4周');
    expect(row.SubmitTime).toBe('');
  });
});
