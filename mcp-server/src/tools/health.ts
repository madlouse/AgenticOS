import { runHealthCheck } from '../utils/health.js';

export async function runHealth(args: any): Promise<string> {
  const result = await runHealthCheck(args ?? {});
  return JSON.stringify(result, null, 2);
}
