/**
 * End-to-end integration test for 360Teams CLI commands.
 * Run: node test-e2e.js
 * Requires: 360Teams running with --remote-debugging-port=9234
 */
import { withElectronPage } from './clis/360teams/cdp.js';
import { extractUserInfo, extractConversations, extractContacts, extractGroups, extractMessages } from './clis/360teams/helpers.js';

const FILE_TRANSFER_ID = 'iQcgzVLSWTuDyGCQespwfvD';
const TEST_MSG = `【e2e test】${new Date().toISOString()}`;

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  ✓ ${name}`);
  passed++;
}

function fail(name, err) {
  console.log(`  ✗ ${name}: ${err}`);
  failed++;
}

async function run(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (e) {
    fail(name, e.message);
  }
}

console.log('\n360Teams CLI — End-to-End Test\n');

await withElectronPage(async (page) => {

  // 1. status
  await run('status: CDP connected', async () => {
    const url = await page.evaluate('window.location.href');
    if (!url) throw new Error('No URL returned');
  });

  // 2. me
  let myId;
  await run('me: returns current user', async () => {
    const staff = await page.evaluate('(()=>{ try { return app.userData.staff } catch(e) { return null } })()');
    if (!staff) throw new Error('No staff data');
    const info = extractUserInfo(staff);
    if (!info.ID || !info.Name) throw new Error(`Missing ID or Name: ${JSON.stringify(info)}`);
    myId = info.ID;
  });

  // 3. conversations
  await run('conversations: returns >0 results', async () => {
    const convList = await page.evaluate('(()=>{ try { return app.$store.getters["conversation/conversationList"] } catch(e) { return [] } })()');
    const rows = extractConversations(convList, 20);
    if (rows.length === 0) throw new Error('Empty conversation list');
  });

  // 4. contacts
  await run('contacts: returns >0 results', async () => {
    const map = await page.evaluate('(()=>{ try { const m = app.$store.getters["chatControl/memberDetails"]; return m ? Object.values(m) : [] } catch(e) { return [] } })()');
    const rows = extractContacts(map, 50);
    if (rows.length === 0) throw new Error('Empty contacts list');
  });

  // 5. groups
  await run('groups: returns >0 results', async () => {
    const map = await page.evaluate('(()=>{ try { const m = app.$store.getters["chatControl/groupDetails"]; return m ? Object.values(m) : [] } catch(e) { return [] } })()');
    const rows = extractGroups(map);
    if (rows.length === 0) throw new Error('Empty groups list');
  });

  // 6. send → 文件传输助手
  let sentMsgContent;
  await run('send: message to 文件传输助手', async () => {
    const result = await page.evaluate(
      `new Promise((resolve) => {
        try {
          const msg = RongIM.dataModel.Message.TextMessage({ content: ${JSON.stringify(TEST_MSG)} });
          RongIM.dataModel.Message.send({ conversationType: 1, targetId: "iQcgzVLSWTuDyGCQespwfvD", content: msg },
            (err, message) => {
              if (err) resolve({ error: String(err) });
              else resolve({ ok: true, messageId: message?.messageId });
            }
          );
        } catch(e) { resolve({ error: e.message }); }
      })`
    );
    if (result.error) throw new Error(result.error);
    if (!result.messageId) throw new Error('No messageId returned');
    sentMsgContent = TEST_MSG;
  });

  // 7. read ← 文件传输助手 — verify sent message appears
  await run('read: sent message appears in 文件传输助手', async () => {
    // Small wait for message to be stored locally
    await new Promise(r => setTimeout(r, 800));
    const messages = await page.evaluate(
      `new Promise((resolve) => {
        try {
          RongIM.dataModel.Message.get(
            { conversationType: 1, targetId: "iQcgzVLSWTuDyGCQespwfvD", timestamp: 0, count: 10, before: true },
            (err, msgs) => { resolve(err ? [] : (msgs || [])); }
          );
        } catch(e) { resolve([]); }
      })`
    );
    const rows = extractMessages(messages, 10);
    if (rows.length === 0) throw new Error('No messages returned');
    const found = rows.some(r => r.Content === sentMsgContent);
    if (!found) throw new Error(`Test message not found in last ${rows.length} messages`);
  });

});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
