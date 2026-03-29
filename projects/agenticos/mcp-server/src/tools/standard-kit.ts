import { adoptStandardKit, checkStandardKitConformance, checkStandardKitUpgrade } from '../utils/standard-kit.js';

export async function runStandardKitAdopt(args: any): Promise<string> {
  const result = await adoptStandardKit(args ?? {});
  return JSON.stringify(result, null, 2);
}

export async function runStandardKitUpgradeCheck(args: any): Promise<string> {
  const result = await checkStandardKitUpgrade(args ?? {});
  return JSON.stringify(result, null, 2);
}

export async function runStandardKitConformanceCheck(args: any): Promise<string> {
  const result = await checkStandardKitConformance(args ?? {});
  return JSON.stringify(result, null, 2);
}
