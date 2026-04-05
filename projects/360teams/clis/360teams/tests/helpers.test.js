import { describe, expect, it } from 'vitest';
import {
  extractUserInfo,
  extractConversations,
  extractContacts,
  extractGroups,
  extractMessages,
} from '../helpers.js';

// ── extractUserInfo ──────────────────────────────────────────────────────────

describe('extractUserInfo', () => {
  it('extracts all fields from a full staff object', () => {
    expect(extractUserInfo({ id: 'u1', name: 'Alice', mobile: '138', department: 'Eng' })).toEqual({
      ID: 'u1', Name: 'Alice', Mobile: '138', Department: 'Eng',
    });
  });

  it('falls back to alternate field names', () => {
    expect(extractUserInfo({ userId: 'u2', displayName: 'Bob', phone: '139', deptName: 'PM' })).toEqual({
      ID: 'u2', Name: 'Bob', Mobile: '139', Department: 'PM',
    });
  });

  it('returns empty strings for missing fields', () => {
    expect(extractUserInfo({})).toEqual({ ID: '', Name: '', Mobile: '', Department: '' });
  });

  it('returns empty object for null input', () => {
    expect(extractUserInfo(null)).toEqual({ ID: '', Name: '', Mobile: '', Department: '' });
  });

  it('returns empty object for undefined input', () => {
    expect(extractUserInfo(undefined)).toEqual({ ID: '', Name: '', Mobile: '', Department: '' });
  });
});

// ── extractConversations ─────────────────────────────────────────────────────

describe('extractConversations', () => {
  it('returns empty array for null input', () => {
    expect(extractConversations(null)).toEqual([]);
  });

  it('returns empty array for empty list', () => {
    expect(extractConversations([])).toEqual([]);
  });

  it('maps a private conversation (type=1)', () => {
    const conv = {
      conversationType: 1,
      targetId: 'user123',
      conversationTitle: 'Alice',
      unreadMessageCount: 3,
      latestMessage: { content: { content: 'hello' } },
    };
    expect(extractConversations([conv])).toEqual([{
      Type: 'private', TargetId: 'user123', Title: 'Alice', Unread: 3, LastMessage: 'hello',
    }]);
  });

  it('maps a group conversation (type=3)', () => {
    const conv = {
      conversationType: 3,
      targetId: 'group456',
      conversationTitle: 'Team',
      unreadMessageCount: 0,
      latestMessage: { content: { text: 'world' } },
    };
    expect(extractConversations([conv])).toEqual([{
      Type: 'group', TargetId: 'group456', Title: 'Team', Unread: 0, LastMessage: 'world',
    }]);
  });

  it('uses targetId as title fallback when conversationTitle is missing', () => {
    const conv = { conversationType: 1, targetId: 'u99', unreadMessageCount: 0 };
    const [row] = extractConversations([conv]);
    expect(row.Title).toBe('u99');
  });

  it('returns empty LastMessage when latestMessage is missing', () => {
    const conv = { conversationType: 1, targetId: 'u1', unreadMessageCount: 0 };
    const [row] = extractConversations([conv]);
    expect(row.LastMessage).toBe('');
  });

  it('respects limit parameter', () => {
    const convs = Array.from({ length: 30 }, (_, i) => ({
      conversationType: 1, targetId: `u${i}`, unreadMessageCount: 0,
    }));
    expect(extractConversations(convs, 5)).toHaveLength(5);
  });

  it('defaults to limit 20', () => {
    const convs = Array.from({ length: 25 }, (_, i) => ({
      conversationType: 1, targetId: `u${i}`, unreadMessageCount: 0,
    }));
    expect(extractConversations(convs)).toHaveLength(20);
  });

  it('handles unknown conversationType as string', () => {
    const conv = { conversationType: 7, targetId: 'x', unreadMessageCount: 0 };
    const [row] = extractConversations([conv]);
    expect(row.Type).toBe('7');
  });

  it('handles missing conversationType as empty string', () => {
    const conv = { targetId: 'x', unreadMessageCount: 0 };
    const [row] = extractConversations([conv]);
    expect(row.Type).toBe('');
  });

  it('handles missing targetId as empty string', () => {
    const conv = { conversationType: 1, unreadMessageCount: 0 };
    const [row] = extractConversations([conv]);
    expect(row.TargetId).toBe('');
    expect(row.Title).toBe('');
  });

  it('handles missing unreadMessageCount as 0', () => {
    const conv = { conversationType: 1, targetId: 'u1' };
    const [row] = extractConversations([conv]);
    expect(row.Unread).toBe(0);
  });

  it('falls back to latestMessage.content.text when content is missing', () => {
    const conv = {
      conversationType: 1, targetId: 'u1', unreadMessageCount: 0,
      latestMessage: { content: { text: 'fallback text' } },
    };
    const [row] = extractConversations([conv]);
    expect(row.LastMessage).toBe('fallback text');
  });
});

// ── extractContacts ──────────────────────────────────────────────────────────

describe('extractContacts', () => {
  it('returns empty array for null input', () => {
    expect(extractContacts(null)).toEqual([]);
  });

  it('returns empty array for empty list', () => {
    expect(extractContacts([])).toEqual([]);
  });

  it('maps a full contact', () => {
    const c = { id: 'c1', name: 'Carol', mobile: '137', department: 'Design' };
    expect(extractContacts([c])).toEqual([{
      ID: 'c1', Name: 'Carol', Mobile: '137', Department: 'Design',
    }]);
  });

  it('falls back to alternate field names', () => {
    const c = { userId: 'c2', displayName: 'Dave', phone: '136', deptName: 'Ops' };
    expect(extractContacts([c])).toEqual([{
      ID: 'c2', Name: 'Dave', Mobile: '136', Department: 'Ops',
    }]);
  });

  it('deduplicates contacts by id', () => {
    const contacts = [
      { id: 'dup', name: 'First' },
      { id: 'dup', name: 'Second' },
    ];
    const rows = extractContacts(contacts);
    expect(rows).toHaveLength(1);
    expect(rows[0].Name).toBe('First');
  });

  it('handles missing department gracefully', () => {
    const c = { id: 'c3', name: 'Eve' };
    const [row] = extractContacts([c]);
    expect(row.Department).toBe('');
  });

  it('respects limit parameter', () => {
    const contacts = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, name: `User${i}` }));
    expect(extractContacts(contacts, 10)).toHaveLength(10);
  });

  it('defaults to limit 50', () => {
    const contacts = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, name: `User${i}` }));
    expect(extractContacts(contacts)).toHaveLength(50);
  });

  it('returns empty ID when all id fields are missing', () => {
    const c = { name: 'Ghost' };
    const [row] = extractContacts([c]);
    expect(row.ID).toBe('');
  });

  it('returns empty Name when name and displayName are both missing', () => {
    const c = { id: 'c-noname' };
    const [row] = extractContacts([c]);
    expect(row.Name).toBe('');
  });
});

// ── extractGroups ────────────────────────────────────────────────────────────

describe('extractGroups', () => {
  it('returns empty array for null input', () => {
    expect(extractGroups(null)).toEqual([]);
  });

  it('returns empty array for empty list', () => {
    expect(extractGroups([])).toEqual([]);
  });

  it('maps a full group', () => {
    const g = { id: 'g1', name: 'Dev Team', memberCount: 12 };
    expect(extractGroups([g])).toEqual([{ ID: 'g1', Name: 'Dev Team', MemberCount: 12 }]);
  });

  it('falls back to alternate field names', () => {
    const g = { groupId: 'g2', groupName: 'Ops', memberNum: 5 };
    expect(extractGroups([g])).toEqual([{ ID: 'g2', Name: 'Ops', MemberCount: 5 }]);
  });

  it('defaults MemberCount to 0 when missing', () => {
    const g = { id: 'g3', name: 'Empty' };
    const [row] = extractGroups([g]);
    expect(row.MemberCount).toBe(0);
  });

  it('maps multiple groups', () => {
    const groups = [
      { id: 'g1', name: 'A', memberCount: 1 },
      { id: 'g2', name: 'B', memberCount: 2 },
    ];
    expect(extractGroups(groups)).toHaveLength(2);
  });

  it('returns empty ID when both id and groupId are missing', () => {
    const g = { name: 'NoId' };
    const [row] = extractGroups([g]);
    expect(row.ID).toBe('');
  });

  it('returns empty Name when both name and groupName are missing', () => {
    const g = { id: 'g-noname' };
    const [row] = extractGroups([g]);
    expect(row.Name).toBe('');
  });
});

// ── extractMessages ───────────────────────────────────────────────────────────

describe('extractMessages', () => {
  it('returns empty array for null input', () => {
    expect(extractMessages(null)).toEqual([]);
  });

  it('returns empty array for empty list', () => {
    expect(extractMessages([])).toEqual([]);
  });

  it('maps a text message', () => {
    const m = { sentTime: 1000000000000, senderUserId: 'u1', messageType: 'TextMessage', content: { content: 'hello' } };
    const [row] = extractMessages([m]);
    expect(row.Sender).toBe('u1');
    expect(row.Type).toBe('TextMessage');
    expect(row.Content).toBe('hello');
    expect(row.Time).toBeTruthy();
  });

  it('falls back to content.text when content.content is missing', () => {
    const m = { sentTime: 1000000000000, senderUserId: 'u1', messageType: 'TextMessage', content: { text: 'fallback' } };
    const [row] = extractMessages([m]);
    expect(row.Content).toBe('fallback');
  });

  it('returns empty Content when content is missing', () => {
    const m = { sentTime: 1000000000000, senderUserId: 'u1', messageType: 'TextMessage' };
    const [row] = extractMessages([m]);
    expect(row.Content).toBe('');
  });

  it('returns empty Time when sentTime is missing', () => {
    const m = { senderUserId: 'u1', messageType: 'TextMessage', content: { content: 'hi' } };
    const [row] = extractMessages([m]);
    expect(row.Time).toBe('');
  });

  it('respects limit parameter (takes last N)', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({
      sentTime: 1000000000000 + i, senderUserId: 'u1', messageType: 'TextMessage', content: { content: `msg${i}` },
    }));
    const rows = extractMessages(msgs, 5);
    expect(rows).toHaveLength(5);
    expect(rows[0].Content).toBe('msg25');
  });

  it('defaults to limit 20', () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({
      sentTime: 1000000000000 + i, senderUserId: 'u1', messageType: 'TextMessage', content: { content: `msg${i}` },
    }));
    expect(extractMessages(msgs)).toHaveLength(20);
  });

  it('falls back to objectName when messageType is missing', () => {
    const m = { sentTime: 1000000000000, senderUserId: 'u1', objectName: 'RC:TxtMsg', content: { content: 'hi' } };
    const [row] = extractMessages([m]);
    expect(row.Type).toBe('RC:TxtMsg');
  });
});
