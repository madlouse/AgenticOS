import { cli, Strategy } from '@jackwener/opencli/dist/registry.js';
import { withElectronPage } from './cdp.js';

cli({
  site: '360teams',
  name: 'status',
  description: 'Check CDP connection to 360Teams and show current user',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [],
  columns: ['Status', 'User', 'Url'],
  func: async () => withElectronPage(async (page) => {
    const url = await page.evaluate('window.location.href');
    const user = await page.evaluate('(()=>{ try { return app.userData.staff.name } catch(e) { return "" } })()');
    return [{ Status: 'Connected', User: user || '(unknown)', Url: url }];
  }),
});
