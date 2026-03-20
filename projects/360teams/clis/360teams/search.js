import { cli, Strategy } from '@jackwener/opencli/dist/registry.js';
import { extractContacts } from './helpers.js';
import { withElectronPage } from './cdp.js';

cli({
  site: '360teams',
  name: 'search',
  description: 'Search contacts by name (case-insensitive partial match)',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'name', required: true, help: 'Name keyword to search for' },
    { name: 'limit', required: false, default: '10', help: 'Max results to return' },
  ],
  columns: ['ID', 'Name', 'Mobile', 'Department'],
  func: async (_page, kwargs) => withElectronPage(async (page) => {
    const keyword = kwargs.name.toLowerCase();
    const limit = parseInt(kwargs.limit, 10) || 10;
    const raw = await page.evaluate(
      '(()=>{ try { const m = app.$store.getters["chatControl/memberDetails"]; return m ? Object.values(m) : [] } catch(e) { return [] } })()'
    );
    const filtered = raw.filter(c => (c.name ?? c.displayName ?? '').toLowerCase().includes(keyword));
    const rows = extractContacts(filtered, limit);
    if (rows.length === 0) throw new Error(`No contacts found matching "${kwargs.name}".`);
    return rows;
  }),
});
