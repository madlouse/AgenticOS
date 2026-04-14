import { runCanonicalSync as runCanonicalSyncOperation } from '../utils/canonical-sync.js';

export async function runCanonicalSync(args: any): Promise<string> {
  const result = await runCanonicalSyncOperation(args ?? {});
  return JSON.stringify(result, null, 2);
}
