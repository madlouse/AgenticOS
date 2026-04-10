import { runMigrationAuditCheck, runMigrateHomeReport } from '../utils/migration-audit.js';

export async function runMigrationAudit(args: any): Promise<string> {
  const result = await runMigrationAuditCheck(args ?? {});
  return JSON.stringify(result, null, 2);
}

export async function runMigrateHome(args: any): Promise<string> {
  const result = await runMigrateHomeReport(args ?? {});
  return JSON.stringify(result, null, 2);
}
