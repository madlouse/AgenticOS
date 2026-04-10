import { runMigrationProjectPlan } from '../utils/migration-project.js';

export async function runMigrateProject(args: any): Promise<string> {
  const result = await runMigrationProjectPlan(args ?? {});
  return JSON.stringify(result, null, 2);
}
