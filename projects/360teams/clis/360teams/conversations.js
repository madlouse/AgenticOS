import { cli, Strategy } from '@jackwener/opencli/dist/registry.js';
import { extractConversations } from './helpers.js';
import { withElectronPage } from './cdp.js';

cli({
  site: '360teams',
  name: 'conversations',
  description: 'List recent conversations (private + group)',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [{ name: 'limit', required: false, default: '20', help: 'Max number of conversations to show' }],
  columns: ['Type', 'TargetId', 'Title', 'Unread', 'LastMessage'],
  func: async (_page, kwargs) => withElectronPage(async (page) => {
    const limit = parseInt(kwargs.limit, 10) || 20;
    const convList = await page.evaluate(
      '(()=>{ try { return app.$store.getters["conversation/conversationList"] } catch(e) { return [] } })()'
    );
    const rows = extractConversations(convList, limit);
    if (rows.length === 0) throw new Error('No conversations found or 360Teams not connected.');
    return rows;
  }),
});
