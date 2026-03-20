import { withElectronPage } from './clis/360teams/cdp.js';

const memberIds = [
  ["MDEP000321", "倪思勇"],
  ["MDEP004077", "郭高升"],
  ["MDEP000266", "张婉雪"],
  ["MDEP020659", "黄俊林"],
];

await withElectronPage(async (page) => {
  const allResults = await page.evaluate(`
    (async function() {
      const members = ${JSON.stringify(memberIds)};
      const results = [];
      for (const [id, name] of members) {
        const msgs = await new Promise((resolve) => {
          const t = setTimeout(() => resolve([]), 8000);
          try {
            RongIM.dataModel.Message.getRemoteHistoryMessages(
              { conversationType: 1, targetId: id, timestamp: 0, count: 100 },
              (err, msgs) => { clearTimeout(t); resolve(err ? [] : (msgs || [])); }
            );
          } catch(e) { clearTimeout(t); resolve([]); }
        });
        const rows = msgs.map(m => {
          let c = '';
          if (typeof m.content === 'string') c = m.content;
          else if (m.content && typeof m.content === 'object') {
            c = m.content.content || m.content.text || JSON.stringify(m.content);
          }
          return {
            time: m.sentTime ? new Date(m.sentTime).toLocaleString('zh-CN') : '',
            sender: m.senderUserId || '',
            content: String(c)
          };
        }).filter(m => {
          const c = String(m.content || '');
          return c.includes('本周') || c.includes('下周') ||
                 c.includes('总结') || c.includes('计划') ||
                 c.includes('进展');
        });
        results.push({ id, name, msgs: rows });
      }
      return results;
    })()
  `);

  for (const { name, id, msgs } of allResults) {
    console.log('\\n=== ' + name + ' (' + id + ') ===');
    if (!msgs || msgs.length === 0) {
      console.log('(无相关消息)');
    } else {
      for (const msg of msgs) {
        console.log('[' + msg.time + '] ' + msg.sender + ':');
        console.log(msg.content);
        console.log('---');
      }
    }
  }
  console.log('\\n完成');
});
