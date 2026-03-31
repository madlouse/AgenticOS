import { cli, Strategy } from '@jackwener/opencli/registry';
import { extractUserInfo } from './helpers.js';
import { withElectronPage } from './cdp.js';

cli({
  site: '360teams',
  name: 'me',
  description: 'Get current logged-in user details',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [],
  columns: ['ID', 'Name', 'Mobile', 'Department'],
  func: async () => withElectronPage(async (page) => {
    const staff = await page.evaluate('(()=>{ try { return app.userData.staff } catch(e) { return null } })()');
    if (!staff) throw new Error('Could not read user data. Is 360Teams running with --remote-debugging-port=9234?');
    return [extractUserInfo(staff)];
  }),
});
