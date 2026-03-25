import { withElectronPage } from './clis/360teams/cdp.js';

const memberIds = [
  ["MDEP025219", "张嘉旭"],
  ["MDEP020659", "黄俊林"],
  ["MDEP022501", "刘立影"],
  ["MDEP000321", "倪思勇"],
  ["MDEP000266", "张婉雪"],
  ["MDEP002429", "雷柴卫"],
  ["MDEP004077", "郭高升"],
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
              (err, msgs) => {
                clearTimeout(t);
                resolve(err ? [] : (msgs || []));
              }
            );
          } catch(e) { clearTimeout(t); resolve([]); }
        });
        const rows = msgs.map(m => {
          let c = '';
          if (typeof m.content === 'string') c = m.content;
          else if (m.content && typeof m.content === 'object') {
            c = String(m.content.content || m.content.text || JSON.stringify(m.content));
          }
          return {
            time: m.sentTime ? new Date(m.sentTime).toLocaleString('zh-CN') : '',
            sender: m.senderUserId || '',
            content: c
          };
        });
        results.push({ id, name, msgs: rows });
      }
      return results;
    })()
  `);

  for (const { name, id, msgs } of allResults) {
    console.log(`\n=== ${name} (${id}) === 共${msgs.length}条`);
    for (const msg of msgs) {
      console.log(`[${msg.time}] ${msg.sender}: ${msg.content.slice(0, 200)}`);
    }
  }
  console.log('\n完成');
});
