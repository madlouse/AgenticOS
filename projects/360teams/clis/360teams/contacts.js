import { cli, Strategy } from '@jackwener/opencli/registry';
import { extractContacts } from './helpers.js';
import { withElectronPage } from './cdp.js';

cli({
  site: '360teams',
  name: 'contacts',
  description: 'List contacts / friend list',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [{ name: 'limit', required: false, default: '50', help: 'Max number of contacts to show' }],
  columns: ['ID', 'Name', 'Mobile', 'Department'],
  func: async (_page, kwargs) => withElectronPage(async (page) => {
    const limit = parseInt(kwargs.limit, 10) || 50;
    // memberDetails is a map of id→staff object; convert to array
    const contacts = await page.evaluate(
      '(()=>{ try { const m = app.$store.getters["chatControl/memberDetails"]; return m ? Object.values(m) : [] } catch(e) { return [] } })()'
    );
    const rows = extractContacts(contacts, limit);
    if (rows.length === 0) throw new Error('No contacts found or 360Teams not connected.');
    return rows;
  }),
});
