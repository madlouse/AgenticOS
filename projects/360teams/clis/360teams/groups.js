import { cli, Strategy } from '@jackwener/opencli/registry';
import { extractGroups } from './helpers.js';
import { withElectronPage } from './cdp.js';

cli({
  site: '360teams',
  name: 'groups',
  description: 'List joined groups',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [],
  columns: ['ID', 'Name', 'MemberCount'],
  func: async () => withElectronPage(async (page) => {
    // groupDetails is a map of id→group object; convert to array
    const groups = await page.evaluate(
      '(()=>{ try { const m = app.$store.getters["chatControl/groupDetails"]; return m ? Object.values(m) : [] } catch(e) { return [] } })()'
    );
    const rows = extractGroups(groups);
    if (rows.length === 0) throw new Error('No groups found or 360Teams not connected.');
    return rows;
  }),
});
