import { describe, expect, it } from 'vitest';
import {
  parseCalendarDayFromText,
  isCalendarNoiseLine,
  parseRoomsFromText,
} from '../calendar.js';

// ── isCalendarNoiseLine ─────────────────────────────────────────────────────

describe('isCalendarNoiseLine', () => {
  const shouldBeNoise = [
    '消息', '待办', 'T5T', '工作台', '云文档', '日程会议', '我的团队',
    'AI工作台', '更多', '创建日程', '找会议室', '会议室投屏',
    '发起视频会议', '预约视频会议', '加入视频会议',
    '月', '周', '日', '今天', '筛选',
    '1', '2', '15', '31',
  ];

  for (const text of shouldBeNoise) {
    it(`returns true for sidenav/noise: "${text}"`, () => {
      expect(isCalendarNoiseLine(text)).toBe(true);
    });
  }

  const shouldNotBeNoise = [
    '项目评审会议',
    '周会',
    '一对一沟通',
    '客户拜访',
    '技术分享',
  ];

  for (const text of shouldNotBeNoise) {
    it(`returns false for meeting title: "${text}"`, () => {
      expect(isCalendarNoiseLine(text)).toBe(false);
    });
  }
});

// ── parseCalendarDayFromText ────────────────────────────────────────────────

describe('parseCalendarDayFromText', () => {
  it('returns empty array for null input', () => {
    expect(parseCalendarDayFromText(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCalendarDayFromText('')).toEqual([]);
  });

  it('parses a meeting title with date', () => {
    const text = [
      '消息', '日程会议', '月',
      '1', '2',
      '项目评审会议', '会议',
      '3',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      Time: '2日',
      Title: '项目评审会议',
      Type: '会议',
    });
  });

  it('associates 会议 label with previous title', () => {
    const text = [
      '消息', '日程会议',
      '1',
      '团队周会', '会议',
      '2',
      '一对一沟通',
      '3',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ Time: '1日', Title: '团队周会', Type: '会议' });
    expect(results[1]).toEqual({ Time: '2日', Title: '一对一沟通', Type: '' });
  });

  it('skips date number lines', () => {
    const text = [
      '消息',
      '1', '2', '3',
      '周会', '会议',
      '4',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(1);
    expect(results[0].Time).toBe('3日');
  });

  it('skips weekday separator lines', () => {
    const text = [
      '消息',
      '周日', '周一', '周二',
      '1',
      '站会', '会议',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(1);
    expect(results[0].Title).toBe('站会');
  });

  it('skips month/year header lines', () => {
    const text = [
      '消息',
      '2026年3月1日',
      '1',
      '站会', '会议',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(1);
    expect(results[0].Title).toBe('站会');
  });

  it('skips all sidenav noise lines', () => {
    const text = [
      '消息', '待办', 'T5T', '工作台', '云文档', '日程会议',
      'AI工作台', '更多', '创建日程',
      '1',
      '站会', '会议',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(1);
    expect(results[0].Title).toBe('站会');
  });

  it('respects limit parameter', () => {
    const lines = ['1', '会议A', '2', '会议B', '3', '会议C'];
    const text = [...Array(10).fill('消息'), ...lines].join('\n');

    const results = parseCalendarDayFromText(text, 2);
    expect(results).toHaveLength(2);
  });

  it('defaults to limit 20', () => {
    const manyMeetings = Array.from({ length: 30 }, (_, i) =>
      `${i + 1}\n会议${i}`
    ).join('\n');
    const text = [...Array(5).fill('消息'), manyMeetings].join('\n');

    const results = parseCalendarDayFromText(text);
    expect(results).toHaveLength(20);
  });

  it('handles meetings without 会议 label', () => {
    const text = [
      '消息',
      '1',
      '内部技术分享',
      '2',
      '项目对齐会',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(2);
    expect(results[0].Type).toBe('');
    expect(results[1].Type).toBe('');
  });

  it('uses "n日" format for date numbers', () => {
    const text = ['消息', '15', '月度总结会', '会议', '31', '季度复盘会', '会议'].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results[0].Time).toBe('15日');
    expect(results[1].Time).toBe('31日');
  });

  it('ignores lines shorter than 2 chars', () => {
    const text = [
      '消息',
      '1',
      'A', // too short
      '周会', '会议',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(1);
    expect(results[0].Title).toBe('周会');
  });

  it('ignores duplicate 会议 labels (only first applies)', () => {
    const text = [
      '消息',
      '1',
      '周会', '会议',
      '会议', '会议',
      '2',
      '站会', '会议',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    // Only one "会议" label exists so second meeting gets empty type
    expect(results).toHaveLength(2);
    expect(results[0].Type).toBe('会议');
  });

  // ── Tab-separated calendar grid format ──────────────────────────────────────

  it('parses tab-separated calendar grid with 会议 type in 3rd column', () => {
    // Real format from E2E: "5日\t重点项目双周例会-0305\t会议"
    const text = [
      '消息', '日程会议', '月', '周', '日', '今天', '筛选',
      '周日', '周一', '周二', '周三', '周四', '周五', '周六',
      '2026年3月1日',
      '4日\t测试进度与风险对齐\t',
      '5日\t重点项目双周例会-0305\t会议',
      '6日\t金科重点项目双周会-3月6日\t',
      '6日\tdeepbank信贷智能体-双周会\t',
      '9日\t研发部双周例会-260309\t',
      '9日\t核心资损与消保风险防控改进工作\t',
      '9日\tAI 信贷员周会 0309\t会议',
      '9日\tAI信贷员小组周会\t',
      '10日\topenclaw讨论\t',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(9);

    // Entry with 会议 type
    expect(results[1]).toEqual({ Time: '5日', Title: '重点项目双周例会-0305', Type: '会议' });

    // Entry without 会议 type (empty tab-separated field)
    expect(results[2]).toEqual({ Time: '6日', Title: '金科重点项目双周会-3月6日', Type: '' });

    // Entry with 会议 type in same tab-separated format
    expect(results[6]).toEqual({ Time: '9日', Title: 'AI 信贷员周会 0309', Type: '会议' });
  });

  it('parses tab-separated rows where date has 会议 type but next title does not', () => {
    // When two meetings on same date, only first has 会议
    const text = [
      '9日\tAI 信贷员周会 0309\t会议',
      '9日\tAI信贷员小组周会\t',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ Time: '9日', Title: 'AI 信贷员周会 0309', Type: '会议' });
    expect(results[1]).toEqual({ Time: '9日', Title: 'AI信贷员小组周会', Type: '' });
  });

  it('handles mixed line-based and tab-separated calendar formats', () => {
    const text = [
      '5日',
      '重点项目双周例会-0305', '会议',
      '6日',
      '金科重点项目双周会-3月6日',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ Time: '5日', Title: '重点项目双周例会-0305', Type: '会议' });
    expect(results[1]).toEqual({ Time: '6日', Title: '金科重点项目双周会-3月6日', Type: '' });
  });

  it('parses tab-separated entry without trailing tab as type empty', () => {
    const text = '6日\t金科重点项目双周会-3月6日';
    const results = parseCalendarDayFromText(text, 20);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ Time: '6日', Title: '金科重点项目双周会-3月6日', Type: '' });
  });

  it('respects limit with tab-separated calendar format', () => {
    const text = [
      '4日\t测试进度与风险对齐\t',
      '5日\t重点项目双周例会-0305\t会议',
      '6日\t金科重点项目双周会-3月6日\t',
      '6日\tdeepbank信贷智能体-双周会\t',
      '9日\t研发部双周例会-260309\t',
    ].join('\n');

    const results = parseCalendarDayFromText(text, 3);
    expect(results).toHaveLength(3);
  });
});

// ── parseRoomsFromText ────────────────────────────────────────────────────────

describe('parseRoomsFromText', () => {
  it('returns empty array for null input', () => {
    expect(parseRoomsFromText(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseRoomsFromText('')).toEqual([]);
  });

  it('returns empty array when no room patterns found', () => {
    const text = ['消息', '日程会议', 'T5T', '工作台'].join('\n');
    expect(parseRoomsFromText(text)).toEqual([]);
  });

  it('parses a single room with name, location, capacity and devices', () => {
    // Real format from innerText dump
    const text = [
      '深圳-东京(深圳绿景NEO大厦-46F)',
      '8',
      '智慧屏(投屏/入会) · 电话 · 白板',
    ].join('\n');

    const rooms = parseRoomsFromText(text);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toEqual({
      Name: '深圳-东京',
      Location: '深圳绿景NEO大厦-46F',
      Capacity: '8人',
      Devices: '智慧屏/电话/白板',
    });
  });

  it('parses room name with hyphens in name part', () => {
    const text = [
      '深圳-大客户-南山(大客户南山区office-12F)',
      '12',
      '智慧屏(投屏/入会) · 电视',
    ].join('\n');

    const rooms = parseRoomsFromText(text);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].Name).toBe('深圳-大客户-南山');
    expect(rooms[0].Location).toBe('大客户南山区office-12F');
  });

  it('handles room with only capacity (no explicit devices line)', () => {
    const text = [
      '深圳-东京(深圳绿景NEO大厦-46F)',
      '8',
    ].join('\n');

    const rooms = parseRoomsFromText(text);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].Capacity).toBe('8人');
    expect(rooms[0].Devices).toBe('');
  });

  it('handles room with devices on same line as capacity', () => {
    const text = [
      '深圳-东京(深圳绿景NEO大厦-46F)',
      '智慧屏(投屏/入会) · 电话 · 白板',
    ].join('\n');

    const rooms = parseRoomsFromText(text);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].Capacity).toBe('');
    expect(rooms[0].Devices).toBe('智慧屏/电话/白板');
  });

  it('skips room entry when next line is noise or another room', () => {
    const text = [
      '深圳-东京(深圳绿景NEO大厦-46F)',
      '8',
      '智慧屏(投屏/入会) · 电话 · 白板',
      '深圳-大客户(大客户office)',
      '10',
      '电视',
    ].join('\n');

    const rooms = parseRoomsFromText(text);
    expect(rooms).toHaveLength(2);
    expect(rooms[0].Name).toBe('深圳-东京');
    expect(rooms[1].Name).toBe('深圳-大客户');
  });

  it('handles large capacity numbers', () => {
    const text = [
      '深圳-会议室-大(大会议室-50F)',
      '50',
      '投影仪 · 电视',
    ].join('\n');

    const rooms = parseRoomsFromText(text);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].Capacity).toBe('50人');
  });

  it('extracts only known device types', () => {
    const text = [
      '深圳-东京(深圳绿景NEO大厦-46F)',
      '8',
      '智慧屏(投屏/入会) · 电话 · 白板 · 投影仪 · 电视 · 其他杂物',
    ].join('\n');

    const rooms = parseRoomsFromText(text);
    expect(rooms[0].Devices).toBe('智慧屏/电话/白板/投影仪/电视');
  });

  it('stops parsing devices when hitting sidenav noise', () => {
    const text = [
      '深圳-东京(深圳绿景NEO大厦-46F)',
      '8',
      '智慧屏(投屏/入会) · 电话',
      '消息', // noise
      '待办',
    ].join('\n');

    const rooms = parseRoomsFromText(text);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].Devices).toBe('智慧屏/电话');
  });

  it('parses multiple rooms in sequence', () => {
    const text = [
      '消息', '日程会议', 'T5T', '工作台',
      '深圳-东京(深圳绿景NEO大厦-46F)',
      '8',
      '智慧屏(投屏/入会) · 电话 · 白板',
      '深圳-大客户(大客户office-10F)',
      '12',
      '智慧屏(投屏/入会) · 电视',
    ].join('\n');

    const rooms = parseRoomsFromText(text);
    expect(rooms).toHaveLength(2);
    expect(rooms[0].Name).toBe('深圳-东京');
    expect(rooms[0].Capacity).toBe('8人');
    expect(rooms[1].Name).toBe('深圳-大客户');
    expect(rooms[1].Capacity).toBe('12人');
  });
});
