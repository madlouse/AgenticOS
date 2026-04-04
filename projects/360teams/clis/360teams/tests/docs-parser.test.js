import { describe, expect, it } from 'vitest';
import {
  extractLengthPrefixedSegments,
  parseDocsContent,
  stitchDocSegments,
} from '../docs.js';

describe('extractLengthPrefixedSegments', () => {
  it('uses the declared length to trim trailing metadata noise', () => {
    const raw =
      'abc!6!金科业务重点!meta!4!4月3日 0 1 10 11 12!tail!3!韩婷、 56 57 58!done';

    expect(extractLengthPrefixedSegments(raw)).toEqual([
      { len: 6, text: '金科业务重点' },
      { len: 4, text: '4月3日' },
      { len: 3, text: '韩婷、' },
    ]);
  });

  it('drops numeric-only metadata fragments', () => {
    const raw = '!2!12!meta!2!项目!tail!1!会!';
    expect(extractLengthPrefixedSegments(raw)).toEqual([
      { len: 2, text: '项目' },
      { len: 1, text: '会' },
    ]);
  });
});

describe('stitchDocSegments', () => {
  it('stitches headings and body segments into readable lines', () => {
    const segments = [
      { len: 6, text: '金科业务重点' },
      { len: 2, text: '项目' },
      { len: 2, text: '双周' },
      { len: 1, text: '会' },
      { len: 4, text: '会议时间' },
      { len: 4, text: '4月3日' },
      { len: 3, text: '汇报人' },
      { len: 3, text: '韩婷、' },
      { len: 3, text: '冯郑懋' },
      { len: 2, text: '1）' },
      { len: 5, text: '- 韩婷' },
    ];

    expect(stitchDocSegments(segments)).toEqual([
      '金科业务重点项目双周会',
      '会议时间4月3日',
      '汇报人韩婷、冯郑懋',
      '1）',
      '- 韩婷',
    ]);
  });
});

describe('parseDocsContent', () => {
  it('keeps JSON OT parsing for classic docs content', () => {
    const raw = JSON.stringify([
      [20, '第一段', ''],
      [20, '\n', ''],
      [20, '第二段', ''],
      [20, '\n', ''],
    ]);

    expect(parseDocsContent(raw, 10)).toEqual([
      { Name: '第一段', Creator: '', Time: '' },
      { Name: '第二段', Creator: '', Time: '' },
    ]);
  });

  it('falls back to length-prefixed parsing for docx token streams', () => {
    const raw = [
      '!6!金科业务重点!',
      '!2!项目!',
      '!2!双周!',
      '!1!会!',
      '!4!会议时间!',
      '!4!4月3日 0 1 10 11!',
      '!3!汇报人!',
      '!3!韩婷、 56 57 58!',
      '!3!冯郑懋 12 13 14!',
      '!2!1） 20 21!',
      '!5!- 韩婷 30 31!',
    ].join('');

    expect(parseDocsContent(raw, 10)).toEqual([
      { Name: '金科业务重点项目双周会', Creator: '', Time: '' },
      { Name: '会议时间4月3日', Creator: '', Time: '' },
      { Name: '汇报人韩婷、冯郑懋', Creator: '', Time: '' },
      { Name: '1）', Creator: '', Time: '' },
      { Name: '- 韩婷', Creator: '', Time: '' },
    ]);
  });
});
