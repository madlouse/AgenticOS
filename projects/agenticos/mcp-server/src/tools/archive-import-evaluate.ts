import { evaluateArchiveImportPolicy } from '../utils/archive-import-policy.js';

export async function runArchiveImportEvaluate(args: any): Promise<string> {
  const result = await evaluateArchiveImportPolicy(args ?? {});
  return JSON.stringify(result, null, 2);
}
