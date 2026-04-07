export interface EditGuardCliOptions {
  repoPath: string;
  projectPath?: string;
  issueId: string;
  taskType: string;
  declaredTargetFiles: string[];
}

export interface EditGuardCliDeps {
  env: Record<string, string | undefined>;
  stdout(line: string): void;
  stderr(line: string): void;
  callEditGuard(options: EditGuardCliOptions): Promise<string>;
}

export function parseEditGuardCliArgs(argv: string[]): EditGuardCliOptions | { help: true } {
  const options: EditGuardCliOptions = {
    repoPath: '',
    issueId: '',
    taskType: 'implementation',
    declaredTargetFiles: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--repo-path':
        options.repoPath = argv[index + 1] || '';
        index += 1;
        break;
      case '--project-path':
        options.projectPath = argv[index + 1] || '';
        index += 1;
        break;
      case '--issue-id':
        options.issueId = argv[index + 1] || '';
        index += 1;
        break;
      case '--task-type':
        options.taskType = argv[index + 1] || '';
        index += 1;
        break;
      case '--declared-target-file':
        options.declaredTargetFiles.push(argv[index + 1] || '');
        index += 1;
        break;
      case '--help':
      case '-h':
        return { help: true };
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function buildEditGuardHelpLines(): string[] {
  return [
    'agenticos-edit-guard — installed runtime wrapper for agenticos_edit_guard',
    '',
    'Usage:',
    '  agenticos-edit-guard \\',
    '    --repo-path /abs/repo \\',
    '    --issue-id 113 \\',
    '    --declared-target-file path/to/file \\',
    '    [--declared-target-file other/file] \\',
    '    [--project-path /abs/project/root] \\',
    '    [--task-type implementation]',
    '',
    'Environment:',
    '  AGENTICOS_HOME             Required AgenticOS workspace root.',
  ];
}

export async function runEditGuardCli(argv: string[], deps: EditGuardCliDeps): Promise<number> {
  try {
    const parsed = parseEditGuardCliArgs(argv);
    if ('help' in parsed) {
      for (const line of buildEditGuardHelpLines()) deps.stdout(line);
      return 0;
    }

    if (!deps.env.AGENTICOS_HOME) {
      deps.stderr('AGENTICOS_HOME is required.');
      return 64;
    }

    if (!parsed.repoPath || !parsed.issueId || parsed.declaredTargetFiles.length === 0) {
      for (const line of buildEditGuardHelpLines()) deps.stderr(line);
      return 64;
    }

    const resultJson = await deps.callEditGuard(parsed);
    deps.stdout(resultJson);

    const result = JSON.parse(resultJson) as { status?: string };
    return result.status === 'PASS' ? 0 : 2;
  } catch (error) {
    deps.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
