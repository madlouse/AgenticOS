import { adoptStandardKit, checkStandardKitConformance, checkStandardKitUpgrade, recordStandardKitUpgrade, needsStandardKitUpgradeDetection, checkProjectStaleness } from '../utils/standard-kit.js';

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

export async function runRecordStandardKitUpgrade(args: any): Promise<string> {
  const result = await recordStandardKitUpgrade();
  return JSON.stringify(result, null, 2);
}

export async function runCheckStaleProjects(args: any): Promise<string> {
  const result = await needsStandardKitUpgradeDetection();
  if (!result.needsCheck) {
    return JSON.stringify({
      status: 'UP_TO_DATE',
      ...result
    }, null, 2);
  }

  // If upgrade detected, check all projects
  const registry = await import('../utils/registry.js').then(m => m.loadRegistry());
  const staleProjects = [];

  for (const project of registry.projects) {
    const staleness = await checkProjectStaleness(project.path);
    if (staleness) {
      staleProjects.push(staleness);
    }
  }

  return JSON.stringify({
    status: 'STALE_PROJECTS_DETECTED',
    upgradeDetected: result,
    staleProjects,
    recommendation: staleProjects.length > 0
      ? `Run agenticos_standard_kit_adopt for each stale project, or use agenticos_standard_kit_upgrade_check to check specific projects.`
      : 'All projects are up-to-date.'
  }, null, 2);
}
