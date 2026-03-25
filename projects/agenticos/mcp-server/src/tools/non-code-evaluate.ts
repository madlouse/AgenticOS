import { evaluateNonCode } from '../utils/non-code-evaluation.js';

export async function runNonCodeEvaluate(args: any): Promise<string> {
  const result = await evaluateNonCode(args ?? {});
  return JSON.stringify(result, null, 2);
}
