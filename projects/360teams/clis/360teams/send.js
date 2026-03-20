import { cli, Strategy } from '@jackwener/opencli/dist/registry.js';
import { withElectronPage } from './cdp.js';

cli({
  site: '360teams',
  name: 'send',
  description: 'Send a text message to a user or group',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'to', required: true, help: 'Target user ID or group ID' },
    { name: 'msg', required: true, help: 'Message text to send' },
    { name: 'type', required: false, default: 'PRIVATE', choices: ['PRIVATE', 'GROUP'], help: 'Conversation type: PRIVATE or GROUP' },
  ],
  columns: ['Status', 'To', 'Type', 'Message'],
  func: async (_page, kwargs) => withElectronPage(async (page) => {
    const to = kwargs.to;
    const msg = kwargs.msg;
    const convType = kwargs.type === 'GROUP' ? 3 : 1;

    const result = await page.evaluate(
      `new Promise((resolve) => {
        try {
          const msg = RongIM.dataModel.Message.TextMessage({ content: ${JSON.stringify(msg)} });
          RongIM.dataModel.Message.send({
            conversationType: ${convType},
            targetId: ${JSON.stringify(to)},
            content: msg,
          }, (err, message) => {
            if (err) resolve({ error: String(err) });
            else resolve({ ok: true, messageId: message?.messageId, sentStatus: message?.sentStatus });
          });
        } catch(e) {
          resolve({ error: e.message });
        }
      })`
    );

    if (result && result.error) throw new Error(`Send failed: ${result.error}`);
    return [{ Status: 'Sent', To: to, Type: kwargs.type, Message: msg }];
  }),
});
