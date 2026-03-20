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
