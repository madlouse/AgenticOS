/**
 * Pure helper functions for 360Teams opencli adapter.
 * All functions are side-effect free and fully unit-testable.
 */

/**
 * Extract user info from app.userData.staff
 * @param {Object|null} staff
 * @returns {Object}
 */
export function extractUserInfo(staff) {
  if (!staff) return { ID: '', Name: '', Mobile: '', Department: '' };
  return {
    ID: staff.id ?? staff.userId ?? '',
    Name: staff.name ?? staff.displayName ?? '',
    Mobile: staff.mobile ?? staff.phone ?? '',
    Department: staff.department ?? staff.deptName ?? '',
  };
}

/**
 * Extract conversation rows from RongIM conversation list
 * @param {Array|null} convList
 * @param {number} limit
 * @returns {Array}
 */
export function extractConversations(convList, limit = 20) {
  if (!Array.isArray(convList) || convList.length === 0) return [];
  return convList.slice(0, limit).map((conv) => ({
    Type: conv.conversationType === 1 ? 'private' : conv.conversationType === 3 ? 'group' : String(conv.conversationType ?? ''),
    TargetId: conv.targetId ?? '',
    Title: conv.conversationTitle ?? conv.targetId ?? '',
    Unread: conv.unreadMessageCount ?? 0,
    LastMessage: conv.latestMessage?.content?.content ?? conv.latestMessage?.content?.text ?? '',
  }));
}

/**
 * Extract contact rows from friend list
 * @param {Array|null} contacts
 * @param {number} limit
 * @returns {Array}
 */
export function extractContacts(contacts, limit = 50) {
  if (!Array.isArray(contacts) || contacts.length === 0) return [];
  const seen = new Set();
  const rows = [];
  for (const c of contacts) {
    const id = c.id ?? c.userId ?? '';
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      ID: id,
      Name: c.name ?? c.displayName ?? '',
      Mobile: c.mobile ?? c.phone ?? '',
      Department: c.department ?? c.deptName ?? '',
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/**
 * Extract message rows from a RongIM message list
 * @param {Array|null} messages
 * @param {number} limit
 * @returns {Array}
 */
export function extractMessages(messages, limit = 20) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  return messages.slice(-limit).map((m) => ({
    Time: m.sentTime ? new Date(m.sentTime).toLocaleString() : '',
    Sender: m.senderUserId ?? '',
    Type: m.messageType ?? m.objectName ?? '',
    Content: m.content?.content ?? m.content?.text ?? '',
  }));
}

/**
 * Extract group rows from group list
 * @param {Array|null} groups
 * @returns {Array}
 */
export function extractGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0) return [];
  return groups.map((g) => ({
    ID: g.id ?? g.groupId ?? '',
    Name: g.name ?? g.groupName ?? '',
    MemberCount: g.memberCount ?? g.memberNum ?? 0,
  }));
}

// ─── T5T Helpers ────────────────────────────────────────────────────────────────

export function parseT5TWeek(weekStr) {
  if (!weekStr) return { year: '', month: '', weekNum: '' };
  const match = weekStr.match(/(\d{4})年(\d+)月第(\d+)周/);
  if (match) return { year: match[1], month: match[2], weekNum: match[3] };
  return { year: '', month: '', weekNum: '' };
}

export function extractT5TStatus(status) {
  if (!status) return [{ Week: 'Unknown', Status: '', SubmitTime: '', Content: '' }];
  const week = status.currentWeek || '当前周期';
  const myStatus = status.currentStatus || '未知';
  return [{
    Week: week,
    Status: myStatus,
    SubmitTime: '',
    Content: `团队: ${status.submitCount || 0}人已提交, ${status.unsubmitCount || 0}人未提交`,
  }];
}

export function extractT5TRecords(records, limit = 10) {
  if (!Array.isArray(records) || records.length === 0) return [];
  return records.slice(0, limit).map((r) => ({
    Week: r.title || '未知周期',
    Status: r.content?.includes('评论') ? '已提交' : '未知',
    SubmitTime: r.time || '',
    Content: (r.content || '').substring(0, 100),
  }));
}

// ─── Docs Helpers ────────────────────────────────────────────────────────────

/**
 * Transform structured doc objects into table rows.
 * @param {Array|null} docs - array of { name, creator, time }
 * @param {number} limit
 * @returns {Array<{Name: string, Creator: string, Time: string}>}
 */
export function extractDocsList(docs, limit = 20) {
  if (!Array.isArray(docs) || docs.length === 0) return [];
  return docs.slice(0, limit).map((d) => ({
    Name: d.name || '',
    Creator: d.creator || '',
    Time: d.time || '',
  }));
}

/**
 * Check if a line is docs UI noise (sidebar items, table headers, buttons).
 * @param {string} line
 * @returns {boolean}
 */
export function isDocsNoiseLine(line) {
  const noisePatterns = [
    /^Recently opened$/,
    /^Shared with me$/,
    /^Favorite$/,
    /^Activities$/,
    /^My space$/,
    /^Team space$/,
    /^Quick access$/,
    /^Trash$/,
    /^Create$/,
    /^Name$/,
    /^Creator$/,
    /^Open time$/,
    /^Share Information$/,
    /^Search for files$/,
    /^最近打开$/,
    /^与我共享$/,
    /^收藏$/,
    /^动态$/,
    /^我的空间$/,
    /^团队空间$/,
    /^快速访问$/,
    /^回收站$/,
    /^新建$/,
    /^名称$/,
    /^创建者$/,
    /^打开时间$/,
    /^共享信息$/,
    /^搜索文件$/,
    /^Share$/,
    /^金科SA$/,
    /^DeepBank/,
    /^金科$/,
    /^\d+$/,
  ];
  return noisePatterns.some((p) => p.test(line));
}
