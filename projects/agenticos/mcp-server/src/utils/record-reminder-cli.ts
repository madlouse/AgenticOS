export interface RecordReminderCliOptions {
  cwd?: string;
  thresholdSeconds: number;
}

export interface RecordReminderCliDeps {
  cwd(): string;
  nowSeconds(): number;
  fileExists(path: string): boolean;
  fileMtimeSeconds(path: string): number;
  dirname(path: string): string;
  basename(path: string): string;
  join(...parts: string[]): string;
  stdout(line: string): void;
  stderr(line: string): void;
}

export function parseRecordReminderCliArgs(argv: string[]): RecordReminderCliOptions | { help: true } {
  const options: RecordReminderCliOptions = {
    thresholdSeconds: 900,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--cwd':
        options.cwd = argv[index + 1] || '';
        index += 1;
        break;
      case '--threshold-seconds':
        options.thresholdSeconds = Number(argv[index + 1] || '');
        index += 1;
        break;
      case '--help':
      case '-h':
        return { help: true };
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.thresholdSeconds) || options.thresholdSeconds < 0) {
    throw new Error('--threshold-seconds must be a non-negative number.');
  }

  return options;
}

export function buildRecordReminderHelpLines(): string[] {
  return [
    'agenticos-record-reminder — installed runtime reminder for missing agenticos_record',
    '',
    'Usage:',
    '  agenticos-record-reminder [--cwd /path] [--threshold-seconds 900]',
  ];
}

export function findProjectDir(startDir: string, deps: RecordReminderCliDeps): string | null {
  let current = startDir;
  while (true) {
    if (deps.fileExists(deps.join(current, '.project.yaml'))) {
      return current;
    }
    const parent = deps.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function runRecordReminderCli(argv: string[], deps: RecordReminderCliDeps): number {
  try {
    const parsed = parseRecordReminderCliArgs(argv);
    if ('help' in parsed) {
      for (const line of buildRecordReminderHelpLines()) deps.stdout(line);
      return 0;
    }

    const projectDir = findProjectDir(parsed.cwd || deps.cwd(), deps);
    if (!projectDir) {
      return 0;
    }

    const marker = deps.join(projectDir, '.context', '.last_record');
    if (deps.fileExists(marker)) {
      const age = deps.nowSeconds() - deps.fileMtimeSeconds(marker);
      if (age < parsed.thresholdSeconds) {
        return 0;
      }
    }

    const projectName = deps.basename(projectDir);
    deps.stdout(`🔔 AgenticOS: 当前在项目「${projectName}」中工作，还未记录会话。请在合适时机调用 agenticos_record 保存进展。`);
    return 0;
  } catch (error) {
    deps.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
