import { createHash } from 'crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import yaml from 'yaml';
import {
  adoptCursorProjectRuleFile,
  augmentConformanceWithCursor,
  augmentUpgradeCheckWithCursor,
  buildCursorGeneratedStatus,
  resolveCursorBridgeProjectContext,
} from '../standard-kit-cursor-bridge.js';
import {
  CURSOR_PROJECT_RULE_RELATIVE_PATH,
  renderCursorProjectRule,
} from '../cursor-project-rule.js';
import * as cursorProjectRule from '../cursor-project-rule.js';
import type { AdoptResult, StandardKitConformanceResult, UpgradeCheckResult } from '../standard-kit.js';

const originalAgenticosHome = process.env.AGENTICOS_HOME;

function setupCursorAdapterMatrixHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'cursor-bridge-matrix-'));
  const bootstrapDir = join(home, 'projects', 'agenticos', '.meta', 'bootstrap');
  mkdirSync(bootstrapDir, { recursive: true });
  writeFileSync(
    join(bootstrapDir, 'agent-adapter-matrix.yaml'),
    yaml.stringify({
      version: 1,
      primary_policy_surface: 'cross-agent-execution-contract',
      adapters: [
        {
          agent_id: 'cursor',
          support_tier: 'official',
          adapter_file: CURSOR_PROJECT_RULE_RELATIVE_PATH,
          adapter_family: 'cursor',
          required_runtime_guidance: [
            '`.cursor/rules/agenticos.mdc` is the Cursor adapter surface for this project.',
            '## Cursor Runtime Notes',
            'global activation Skill at `~/.cursor/skills-cursor/agenticos/SKILL.md`',
            'Use AgenticOS MCP tools before shell directory search',
            '`agenticos_status`',
            '`agenticos_switch`',
            '`agenticos_issue_bootstrap`',
          ],
        },
      ],
    }),
    'utf-8',
  );
  process.env.AGENTICOS_HOME = home;
  return home;
}

function makeAdoptResult(projectPath: string): AdoptResult {
  return {
    command: 'agenticos_standard_kit_adopt',
    status: 'ADOPTED',
    project_path: projectPath,
    project_name: 'Sample Project',
    project_id: 'sample-project',
    kit_id: 'downstream-standard-kit',
    kit_version: '0.2.0',
    created_files: [],
    upgraded_generated_files: [],
    skipped_existing_templates: [],
    skipped_current_generated_files: [],
  };
}

function makeUpgradeResult(projectPath: string): UpgradeCheckResult {
  return {
    command: 'agenticos_standard_kit_upgrade_check',
    status: 'CHECKED',
    project_path: projectPath,
    project_name: 'Sample Project',
    project_id: 'sample-project',
    kit_id: 'downstream-standard-kit',
    kit_version: '0.2.0',
    missing_required_files: [],
    generated_files: [],
    copied_templates: [],
  };
}

describe('standard-kit-cursor-bridge', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalAgenticosHome === undefined) {
      delete process.env.AGENTICOS_HOME;
    } else {
      process.env.AGENTICOS_HOME = originalAgenticosHome;
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates a missing Cursor project rule during adopt', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-adopt-'));
    tempDirs.push(projectPath);
    writeFileSync(join(projectPath, '.project.yaml'), 'meta:\n  name: Sample Project\n', 'utf-8');

    const project = resolveCursorBridgeProjectContext(projectPath, 'Sample Project', 'Bridge test');
    const result = adoptCursorProjectRuleFile(makeAdoptResult(projectPath), project);

    expect(result.created_files).toContain(CURSOR_PROJECT_RULE_RELATIVE_PATH);
    expect(readFileSync(join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH), 'utf-8')).toContain('alwaysApply: true');
  });

  it('skips current and preserves user-modified Cursor project rules', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-skip-'));
    tempDirs.push(projectPath);
    writeFileSync(join(projectPath, '.project.yaml'), 'meta:\n  name: Sample Project\n', 'utf-8');

    const project = resolveCursorBridgeProjectContext(projectPath, 'Sample Project', '');
    const current = renderCursorProjectRule('Sample Project', '');
    mkdirSync(join(projectPath, '.cursor', 'rules'), { recursive: true });
    writeFileSync(join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH), current, 'utf-8');

    const skippedCurrent = adoptCursorProjectRuleFile(makeAdoptResult(projectPath), project);
    expect(skippedCurrent.skipped_current_generated_files).toContain(CURSOR_PROJECT_RULE_RELATIVE_PATH);

    const modified = current.replace('## Cursor Runtime Notes', '## Cursor Runtime Notes\n\nLocal note.');
    writeFileSync(join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH), modified, 'utf-8');
    const skippedModified = adoptCursorProjectRuleFile(makeAdoptResult(projectPath), project);
    expect(skippedModified.skipped_existing_templates).toContain(CURSOR_PROJECT_RULE_RELATIVE_PATH);
  });

  it('upgrades stale managed Cursor project rules', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-upgrade-'));
    tempDirs.push(projectPath);
    writeFileSync(join(projectPath, '.project.yaml'), 'meta:\n  name: Sample Project\n', 'utf-8');

    const rendered = renderCursorProjectRule('Sample Project', '');
    const staleBody = rendered.replace('template_version: 1', 'template_version: 0').replace(/^<!-- agenticos-skill-managed-sha256: [a-f0-9]{64} -->\n?/m, '');
    const staleHash = createHash('sha256').update(staleBody, 'utf-8').digest('hex');
    const stale = staleBody.replace('\n---\n', `\n---\n<!-- agenticos-skill-managed-sha256: ${staleHash} -->\n`);
    mkdirSync(join(projectPath, '.cursor', 'rules'), { recursive: true });
    writeFileSync(join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH), stale, 'utf-8');

    const project = resolveCursorBridgeProjectContext(projectPath, 'Sample Project', '');
    const result = adoptCursorProjectRuleFile(makeAdoptResult(projectPath), project);

    expect(result.upgraded_generated_files).toContain(CURSOR_PROJECT_RULE_RELATIVE_PATH);
    expect(buildCursorGeneratedStatus(
      readFileSync(join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH), 'utf-8'),
      project,
    ).status).toBe('current');
  });

  it('augments upgrade checks with Cursor generated status', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-check-'));
    tempDirs.push(projectPath);
    writeFileSync(join(projectPath, '.project.yaml'), 'meta:\n  name: Sample Project\n', 'utf-8');

    const project = resolveCursorBridgeProjectContext(projectPath, 'Sample Project', '');
    const missing = augmentUpgradeCheckWithCursor(makeUpgradeResult(projectPath), project);
    expect(missing.generated_files.find((item) => item.path === CURSOR_PROJECT_RULE_RELATIVE_PATH)).toMatchObject({
      status: 'missing',
    });
    expect(missing.missing_required_files).toContain(CURSOR_PROJECT_RULE_RELATIVE_PATH);

    mkdirSync(join(projectPath, '.cursor', 'rules'), { recursive: true });
    writeFileSync(
      join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH),
      renderCursorProjectRule('Sample Project', ''),
      'utf-8',
    );
    const current = augmentUpgradeCheckWithCursor(makeUpgradeResult(projectPath), project);
    expect(current.generated_files.find((item) => item.path === CURSOR_PROJECT_RULE_RELATIVE_PATH)).toMatchObject({
      status: 'current',
    });
    expect(current.missing_required_files).not.toContain(CURSOR_PROJECT_RULE_RELATIVE_PATH);
  });

  it('augments conformance with a passing Cursor adapter check', async () => {
    const matrixHome = setupCursorAdapterMatrixHome();
    tempDirs.push(matrixHome);
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-conformance-'));
    tempDirs.push(projectPath);
    writeFileSync(join(projectPath, '.project.yaml'), 'meta:\n  name: Sample Project\n', 'utf-8');
    mkdirSync(join(projectPath, '.cursor', 'rules'), { recursive: true });
    writeFileSync(
      join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH),
      renderCursorProjectRule('Sample Project', ''),
      'utf-8',
    );

    const project = resolveCursorBridgeProjectContext(projectPath, 'Sample Project', '');
    const base: StandardKitConformanceResult = {
      command: 'agenticos_standard_kit_conformance_check',
      status: 'FAIL',
      summary: 'standard-kit conformance failed: 0 missing files, 0 failed behaviors, 1 failed adapters',
      project_path: projectPath,
      project_name: 'Sample Project',
      project_id: 'sample-project',
      kit_id: 'downstream-standard-kit',
      kit_version: '0.2.0',
      missing_required_files: [],
      generated_files: [],
      copied_templates: [],
      behavior_checks: [{ behavior: 'cross_agent_policy_contract', status: 'PASS', summary: 'ok', evidence_paths: [] }],
      adapter_checks: [
        {
          agent_id: 'cursor',
          adapter_file: CURSOR_PROJECT_RULE_RELATIVE_PATH,
          status: 'FAIL',
          summary: 'wrong content source',
        },
      ],
    };

    const augmented = await augmentConformanceWithCursor(base, project);
    expect(augmented.adapter_checks.find((item) => item.agent_id === 'cursor')).toMatchObject({ status: 'PASS' });
    expect(augmented.status).toBe('PASS');
  });

  it('returns SKIP conformance unchanged', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-skip-conformance-'));
    tempDirs.push(projectPath);
    const project = resolveCursorBridgeProjectContext(projectPath, 'Sample Project', '');
    const skipped: StandardKitConformanceResult = {
      command: 'agenticos_standard_kit_conformance_check',
      status: 'SKIP',
      summary: 'skipped',
      project_path: projectPath,
      project_name: 'Sample Project',
      project_id: 'sample-project',
      kit_id: 'downstream-standard-kit',
      kit_version: '0.2.0',
      missing_required_files: [],
      generated_files: [],
      copied_templates: [],
      behavior_checks: [],
      adapter_checks: [],
    };

    await expect(augmentConformanceWithCursor(skipped, project)).resolves.toBe(skipped);
  });

  it('returns conformance unchanged when the adapter matrix has no Cursor entry', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cursor-bridge-no-cursor-matrix-'));
    tempDirs.push(home);
    const bootstrapDir = join(home, 'projects', 'agenticos', '.meta', 'bootstrap');
    mkdirSync(bootstrapDir, { recursive: true });
    writeFileSync(
      join(bootstrapDir, 'agent-adapter-matrix.yaml'),
      yaml.stringify({
        version: 1,
        primary_policy_surface: 'cross-agent-execution-contract',
        adapters: [],
      }),
      'utf-8',
    );
    process.env.AGENTICOS_HOME = home;

    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-no-cursor-project-'));
    tempDirs.push(projectPath);
    const project = resolveCursorBridgeProjectContext(projectPath, 'Sample Project', '');
    const base: StandardKitConformanceResult = {
      command: 'agenticos_standard_kit_conformance_check',
      status: 'FAIL',
      summary: 'base failure',
      project_path: projectPath,
      project_name: 'Sample Project',
      project_id: 'sample-project',
      kit_id: 'downstream-standard-kit',
      kit_version: '0.2.0',
      missing_required_files: [],
      generated_files: [],
      copied_templates: [],
      behavior_checks: [],
      adapter_checks: [],
    };

    await expect(augmentConformanceWithCursor(base, project)).resolves.toBe(base);
  });

  it('marks conformance FAIL when Cursor guidance is missing from the rule file', async () => {
    const matrixHome = setupCursorAdapterMatrixHome();
    tempDirs.push(matrixHome);
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-fail-conformance-'));
    tempDirs.push(projectPath);
    writeFileSync(join(projectPath, '.project.yaml'), 'meta:\n  name: Sample Project\n', 'utf-8');
    mkdirSync(join(projectPath, '.cursor', 'rules'), { recursive: true });
    writeFileSync(
      join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH),
      renderCursorProjectRule('Sample Project', '').replace('## Cursor Runtime Notes', '## Runtime Notes'),
      'utf-8',
    );

    const project = resolveCursorBridgeProjectContext(projectPath, 'Sample Project', '');
    const base: StandardKitConformanceResult = {
      command: 'agenticos_standard_kit_conformance_check',
      status: 'PASS',
      summary: 'standard-kit conformance passed',
      project_path: projectPath,
      project_name: 'Sample Project',
      project_id: 'sample-project',
      kit_id: 'downstream-standard-kit',
      kit_version: '0.2.0',
      missing_required_files: [],
      generated_files: [],
      copied_templates: [],
      behavior_checks: [{ behavior: 'cross_agent_policy_contract', status: 'PASS', summary: 'ok', evidence_paths: [] }],
      adapter_checks: [],
    };

    const augmented = await augmentConformanceWithCursor(base, project);
    expect(augmented.adapter_checks.find((item) => item.agent_id === 'cursor')).toMatchObject({ status: 'FAIL' });
    expect(augmented.status).toBe('FAIL');
  });

  it('resolves project context when .project.yaml is missing', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-no-project-yaml-'));
    tempDirs.push(projectPath);

    const project = resolveCursorBridgeProjectContext(projectPath, 'Fallback Name', 'Fallback description');
    expect(project.projectName).toBe('Fallback Name');
    expect(project.projectDescription).toBe('Fallback description');
  });

  it('keeps skipped-current adopt result when upgrade returns unchanged content', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-no-op-upgrade-'));
    tempDirs.push(projectPath);
    writeFileSync(join(projectPath, '.project.yaml'), 'meta:\n  name: Sample Project\n', 'utf-8');

    const project = resolveCursorBridgeProjectContext(projectPath, 'Sample Project', '');
    const current = renderCursorProjectRule('Sample Project', '', project.agentContextPaths);
    mkdirSync(join(projectPath, '.cursor', 'rules'), { recursive: true });
    writeFileSync(join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH), current, 'utf-8');

    const staleBody = current.replace('template_version: 1', 'template_version: 0').replace(/^<!-- agenticos-skill-managed-sha256: [a-f0-9]{64} -->\n?/m, '');
    const staleHash = createHash('sha256').update(staleBody, 'utf-8').digest('hex');
    const stale = staleBody.replace('\n---\n', `\n---\n<!-- agenticos-skill-managed-sha256: ${staleHash} -->\n`);
    writeFileSync(join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH), stale, 'utf-8');

    const first = adoptCursorProjectRuleFile(makeAdoptResult(projectPath), project);
    expect(first.upgraded_generated_files).toContain(CURSOR_PROJECT_RULE_RELATIVE_PATH);

    const second = adoptCursorProjectRuleFile(makeAdoptResult(projectPath), project);
    expect(second.skipped_current_generated_files).toContain(CURSOR_PROJECT_RULE_RELATIVE_PATH);
  });

  it('skips adopt writes when upgrade output matches the existing file bytes', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-upgrade-noop-bytes-'));
    tempDirs.push(projectPath);
    writeFileSync(join(projectPath, '.project.yaml'), 'meta:\n  name: Sample Project\n', 'utf-8');

    const project = resolveCursorBridgeProjectContext(projectPath);
    const existing = renderCursorProjectRule('Sample Project', '', project.agentContextPaths);
    mkdirSync(join(projectPath, '.cursor', 'rules'), { recursive: true });
    writeFileSync(join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH), existing, 'utf-8');

    vi.spyOn(cursorProjectRule, 'upgradeCursorProjectRule').mockReturnValue(existing);
    vi.spyOn(cursorProjectRule, 'cursorProjectRuleUpgradeStatus').mockReturnValue('stale');
    vi.spyOn(cursorProjectRule, 'inspectCursorProjectRule').mockReturnValue({
      status: 'stale-managed',
      installedVersion: 0,
      expectedVersion: 1,
      detail: 'stale',
    });

    const result = adoptCursorProjectRuleFile(makeAdoptResult(projectPath), project);
    expect(result.skipped_current_generated_files).toContain(CURSOR_PROJECT_RULE_RELATIVE_PATH);
    expect(readFileSync(join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH), 'utf-8')).toBe(existing);

    vi.restoreAllMocks();
  });

  it('adds missing Cursor rule paths to conformance results', async () => {
    const matrixHome = setupCursorAdapterMatrixHome();
    tempDirs.push(matrixHome);
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-missing-conformance-'));
    tempDirs.push(projectPath);
    writeFileSync(join(projectPath, '.project.yaml'), 'meta:\n  name: Sample Project\n', 'utf-8');

    const project = resolveCursorBridgeProjectContext(projectPath, 'Sample Project', '');
    const base: StandardKitConformanceResult = {
      command: 'agenticos_standard_kit_conformance_check',
      status: 'FAIL',
      summary: 'missing cursor rule',
      project_path: projectPath,
      project_name: 'Sample Project',
      project_id: 'sample-project',
      kit_id: 'downstream-standard-kit',
      kit_version: '0.2.0',
      missing_required_files: [],
      generated_files: [],
      copied_templates: [],
      behavior_checks: [],
      adapter_checks: [],
    };

    const augmented = await augmentConformanceWithCursor(base, project);
    expect(augmented.missing_required_files).toContain(CURSOR_PROJECT_RULE_RELATIVE_PATH);
    expect(augmented.adapter_checks.find((item) => item.agent_id === 'cursor')).toMatchObject({ status: 'FAIL' });
  });

  it('reads project metadata from .project.yaml when explicit names are omitted', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-project-meta-'));
    tempDirs.push(projectPath);
    writeFileSync(
      join(projectPath, '.project.yaml'),
      'meta:\n  name: Yaml Project\n  description: From yaml\n',
      'utf-8',
    );

    const project = resolveCursorBridgeProjectContext(projectPath);
    expect(project.projectName).toBe('Yaml Project');
    expect(project.projectDescription).toBe('From yaml');
  });

  it('prefers explicit project identity over .project.yaml metadata', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-explicit-meta-'));
    tempDirs.push(projectPath);
    writeFileSync(
      join(projectPath, '.project.yaml'),
      'meta:\n  name: Yaml Project\n  description: From yaml\n',
      'utf-8',
    );

    const project = resolveCursorBridgeProjectContext(projectPath, 'Explicit Project', 'Explicit description');
    expect(project.projectName).toBe('Explicit Project');
    expect(project.projectDescription).toBe('Explicit description');
  });

  it('falls back to default project identity when metadata is unavailable', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-default-meta-'));
    tempDirs.push(projectPath);

    const project = resolveCursorBridgeProjectContext(projectPath);
    expect(project.projectName).toBe('Project');
    expect(project.projectDescription).toBe('');
  });

  it('treats empty .project.yaml files as missing metadata', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'cursor-bridge-empty-project-yaml-'));
    tempDirs.push(projectPath);
    writeFileSync(join(projectPath, '.project.yaml'), '', 'utf-8');

    const project = resolveCursorBridgeProjectContext(projectPath);
    expect(project.projectName).toBe('Project');
    expect(project.projectDescription).toBe('');
  });
});
