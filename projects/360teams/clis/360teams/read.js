import { cli, Strategy } from '@jackwener/opencli/dist/registry.js';
import { extractMessages } from './helpers.js';
import { withElectronPage } from './cdp.js';

cli({
  site: '360teams',
  name: 'read',
  description: 'Read recent messages from a conversation',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'target', required: true, help: 'Target user ID or group ID' },
    { name: 'limit', required: false, default: '20', help: 'Number of messages to fetch' },
    { name: 'type', required: false, default: 'PRIVATE', choices: ['PRIVATE', 'GROUP'], help: 'Conversation type' },
  ],
  columns: ['Time', 'Sender', 'Type', 'Content'],
  func: async (_page, kwargs) => withElectronPage(async (page) => {
    const target = kwargs.target;
    const limit = parseInt(kwargs.limit, 10) || 20;
    const convType = kwargs.type === 'GROUP' ? 3 : 1;

    const messages = await page.evaluate(
      `new Promise((resolve) => {
        try {
          RongIM.dataModel.Message.get(
            { conversationType: ${convType}, targetId: ${JSON.stringify(target)}, timestamp: 0, count: ${limit}, before: true },
            (err, msgs) => { resolve(err ? [] : (msgs || [])); }
          );
        } catch(e) { resolve([]); }
      })`
    );

    const rows = extractMessages(messages, limit);
    if (rows.length === 0) throw new Error('No messages found.');
    return rows;
  }),
});
