import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { renderConfigAuditResult, runConfigAudit } from '../utils/config-audit.js';

export async function runConfig(args: any): Promise<string> {
  const result = runConfigAudit(args ?? {}, {
    env: process.env,
    homeDir: homedir(),
    platform: process.platform,
    shellPath: process.env.SHELL,
    nowIso() {
      return new Date().toISOString();
    },
    commandExists(command: string) {
      const probe = spawnSync('which', [command], { stdio: 'ignore' });
      return probe.status === 0;
    },
    runCommand(command: string, args: string[], failOnError: boolean) {
      const probe = spawnSync(command, args, { encoding: 'utf-8' });
      const output = `${probe.stdout || ''}${probe.stderr || ''}`.trim();
      const detail = output || probe.error?.message || `${command} exited with status ${probe.status ?? 'unknown'}`;
      if (probe.status !== 0 && failOnError) {
        return { ok: false, detail };
      }
      return { ok: probe.status === 0, detail };
    },
    readFile(path: string) {
      try {
        return readFileSync(path, 'utf-8');
      } catch {
        return null;
      }
    },
    pathExists(path: string) {
      return existsSync(path);
    },
  });

  return renderConfigAuditResult(result);
}
