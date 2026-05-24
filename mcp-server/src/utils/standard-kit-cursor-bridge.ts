import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import yaml from 'yaml';
import { resolveManagedProjectContextDisplayPaths } from './agent-context-paths.js';
import { getOfficialAgentAdapters, loadAgentAdapterMatrix } from './agent-adapter-matrix.js';
import {
  CURSOR_PROJECT_RULE_RELATIVE_PATH,
  CURSOR_PROJECT_RULE_TEMPLATE_VERSION,
  cursorProjectRuleUpgradeStatus,
  inspectCursorProjectRule,
  renderCursorProjectRule,
  upgradeCursorProjectRule,
} from './cursor-project-rule.js';
import type {
  AdoptResult,
  ResolvedProjectTarget,
  StandardKitConformanceResult,
  UpgradeCheckGeneratedStatus,
  UpgradeCheckResult,
} from './standard-kit.js';

export const CURSOR_PROJECT_RULE_REQUIRED = CURSOR_PROJECT_RULE_RELATIVE_PATH;

export interface CursorBridgeProjectContext {
  projectPath: string;
  projectName: string;
  projectDescription: string;
  agentContextPaths: ResolvedProjectTarget['agentContextPaths'];
}

function fileContainsAll(content: string | null, needles: string[]): boolean {
  return needles.every((needle) => Boolean(content?.includes(needle)));
}

export function resolveCursorBridgeProjectContext(
  projectPath: string,
  projectName?: string,
  projectDescription?: string,
): CursorBridgeProjectContext {
  let projectYaml: any = {};
  try {
    projectYaml = yaml.parse(readFileSync(join(projectPath, '.project.yaml'), 'utf-8')) || {};
  } catch {
    projectYaml = {};
  }

  const meta = projectYaml.meta || {};
  return {
    projectPath,
    projectName: projectName || meta.name || 'Project',
    projectDescription: projectDescription || meta.description || '',
    agentContextPaths: resolveManagedProjectContextDisplayPaths(projectYaml),
  };
}

export function buildCursorGeneratedStatus(
  content: string | null,
  project: Pick<CursorBridgeProjectContext, 'projectName' | 'projectDescription' | 'agentContextPaths'>,
): UpgradeCheckGeneratedStatus {
  const inspection = inspectCursorProjectRule(
    content,
    project.projectName,
    project.projectDescription,
    project.agentContextPaths,
  );
  const upgradeStatus = cursorProjectRuleUpgradeStatus(
    content,
    project.projectName,
    project.projectDescription,
    project.agentContextPaths,
  );

  return {
    path: CURSOR_PROJECT_RULE_RELATIVE_PATH,
    status: upgradeStatus,
    current_version: inspection.installedVersion,
    expected_version: CURSOR_PROJECT_RULE_TEMPLATE_VERSION,
  };
}

export function adoptCursorProjectRuleFile(
  result: AdoptResult,
  project: CursorBridgeProjectContext,
): AdoptResult {
  const destination = join(project.projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH);

  if (!existsSync(destination)) {
    const content = renderCursorProjectRule(
      project.projectName,
      project.projectDescription,
      project.agentContextPaths,
    );
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content, 'utf-8');
    return {
      ...result,
      created_files: [...result.created_files, CURSOR_PROJECT_RULE_RELATIVE_PATH],
    };
  }

  const existingContent = readFileSync(destination, 'utf-8');
  const inspection = inspectCursorProjectRule(
    existingContent,
    project.projectName,
    project.projectDescription,
    project.agentContextPaths,
  );
  const upgradeStatus = cursorProjectRuleUpgradeStatus(
    existingContent,
    project.projectName,
    project.projectDescription,
    project.agentContextPaths,
  );

  if (upgradeStatus === 'current') {
    return {
      ...result,
      skipped_current_generated_files: [
        ...result.skipped_current_generated_files,
        CURSOR_PROJECT_RULE_RELATIVE_PATH,
      ],
    };
  }

  if (inspection.status === 'modified-user') {
    return {
      ...result,
      skipped_existing_templates: [
        ...result.skipped_existing_templates,
        CURSOR_PROJECT_RULE_RELATIVE_PATH,
      ],
    };
  }

  const upgraded = upgradeCursorProjectRule(
    destination,
    project.projectName,
    project.projectDescription,
    project.agentContextPaths,
  );
  if (upgraded !== existingContent) {
    writeFileSync(destination, upgraded, 'utf-8');
    return {
      ...result,
      upgraded_generated_files: [...result.upgraded_generated_files, CURSOR_PROJECT_RULE_RELATIVE_PATH],
    };
  }

  return {
    ...result,
    skipped_current_generated_files: [
      ...result.skipped_current_generated_files,
      CURSOR_PROJECT_RULE_RELATIVE_PATH,
    ],
  };
}

export function augmentUpgradeCheckWithCursor(
  upgrade: UpgradeCheckResult,
  project: CursorBridgeProjectContext,
): UpgradeCheckResult {
  const destination = join(project.projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH);
  let content: string | null = null;
  try {
    content = readFileSync(destination, 'utf-8');
  } catch {
    content = null;
  }

  const cursorStatus = buildCursorGeneratedStatus(content, project);
  const generated_files = [
    ...upgrade.generated_files.filter((item) => item.path !== CURSOR_PROJECT_RULE_RELATIVE_PATH),
    cursorStatus,
  ];
  const missing_required_files = upgrade.missing_required_files.filter(
    (path) => path !== CURSOR_PROJECT_RULE_RELATIVE_PATH,
  );
  if (cursorStatus.status === 'missing') {
    missing_required_files.push(CURSOR_PROJECT_RULE_RELATIVE_PATH);
  }

  return {
    ...upgrade,
    missing_required_files,
    generated_files,
  };
}

export async function augmentConformanceWithCursor(
  conformance: StandardKitConformanceResult,
  project: CursorBridgeProjectContext,
): Promise<StandardKitConformanceResult> {
  if (conformance.status === 'SKIP') {
    return conformance;
  }

  const destination = join(project.projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH);
  const cursorRuleMd = existsSync(destination) ? readFileSync(destination, 'utf-8') : null;
  const officialAdapters = getOfficialAgentAdapters(await loadAgentAdapterMatrix());
  const cursorAdapter = officialAdapters.find((adapter) => adapter.agent_id === 'cursor');
  if (!cursorAdapter) {
    return conformance;
  }

  const generatedStatus = buildCursorGeneratedStatus(cursorRuleMd, project);
  const pass = generatedStatus.status === 'current'
    && fileContainsAll(cursorRuleMd, cursorAdapter.required_runtime_guidance);

  const cursorCheck = {
    agent_id: cursorAdapter.agent_id,
    adapter_file: cursorAdapter.adapter_file,
    status: pass ? 'PASS' as const : 'FAIL' as const,
    summary: pass
      ? `${cursorAdapter.agent_id} is covered by a current generated adapter surface with required runtime guidance.`
      : `${cursorAdapter.agent_id} is missing a current generated adapter surface or required runtime guidance.`,
  };

  const adapter_checks = [
    ...conformance.adapter_checks.filter((item) => item.agent_id !== 'cursor'),
    cursorCheck,
  ];
  const generated_files = [
    ...conformance.generated_files.filter((item) => item.path !== CURSOR_PROJECT_RULE_RELATIVE_PATH),
    generatedStatus,
  ];
  const missing_required_files = conformance.missing_required_files.filter(
    (path) => path !== CURSOR_PROJECT_RULE_RELATIVE_PATH,
  );
  if (generatedStatus.status === 'missing') {
    missing_required_files.push(CURSOR_PROJECT_RULE_RELATIVE_PATH);
  }

  const failedBehaviors = conformance.behavior_checks.filter((item) => item.status === 'FAIL');
  const failedAdapters = adapter_checks.filter((item) => item.status === 'FAIL');
  const generatedDrift = generated_files.filter((item) => item.status !== 'current');
  const status = missing_required_files.length === 0
    && failedBehaviors.length === 0
    && failedAdapters.length === 0
    && generatedDrift.length === 0
    ? 'PASS'
    : 'FAIL';

  return {
    ...conformance,
    status,
    summary: status === 'PASS'
      ? 'standard-kit conformance passed'
      : `standard-kit conformance failed: ${missing_required_files.length} missing files, ${failedBehaviors.length} failed behaviors, ${failedAdapters.length} failed adapters`,
    missing_required_files,
    generated_files,
    adapter_checks,
  };
}
