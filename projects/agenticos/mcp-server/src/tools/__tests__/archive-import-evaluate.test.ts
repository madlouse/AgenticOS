import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { runArchiveImportEvaluate } from '../archive-import-evaluate.js';

async function setupProject(projectYamlContent?: string): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'agenticos-archive-import-'));
  await mkdir(projectRoot, { recursive: true });
  if (projectYamlContent) {
    await writeFile(join(projectRoot, '.project.yaml'), projectYamlContent, 'utf-8');
  }
  return projectRoot;
}

describe('runArchiveImportEvaluate', () => {
  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('classifies archive candidates with the default policy and blocks reject or unclassified paths', async () => {
    const projectRoot = await setupProject('meta:\n  id: sample\n  name: Sample\n');

    const result = JSON.parse(await runArchiveImportEvaluate({
      project_path: projectRoot,
      candidate_paths: [
        'README.md',
        '.context/state.yaml',
        '.DS_Store',
        'local-backups/preferences.db',
      ],
    })) as {
      status: string;
      active_source_files: string[];
      provenance_only_files: string[];
      rejected_files: string[];
      unclassified_files: string[];
      block_reasons: string[];
    };

    expect(result.status).toBe('BLOCK');
    expect(result.active_source_files).toEqual(['README.md']);
    expect(result.provenance_only_files).toEqual(['.context/state.yaml']);
    expect(result.rejected_files).toEqual(['.DS_Store']);
    expect(result.unclassified_files).toEqual(['local-backups/preferences.db']);
    expect(result.block_reasons.join(' ')).toContain('reject list matched');
    expect(result.block_reasons.join(' ')).toContain('policy did not classify');
  });

  it('allows project-local additive patterns to classify additional active or provenance-only files', async () => {
    const projectRoot = await setupProject([
      'meta:',
      '  id: sample',
      '  name: Sample',
      'archive_import_policy:',
      '  active_source_allowlist:',
      '    - "notes/**"',
      '  provenance_only_allowlist:',
      '    - "legacy-db/**"',
      '',
    ].join('\n'));

    const result = JSON.parse(await runArchiveImportEvaluate({
      project_path: projectRoot,
      candidate_paths: [
        'notes/runbook.md',
        'legacy-db/schema.sql',
      ],
    })) as {
      status: string;
      active_source_files: string[];
      provenance_only_files: string[];
      rejected_files: string[];
      unclassified_files: string[];
    };

    expect(result.status).toBe('PASS');
    expect(result.active_source_files).toEqual(['notes/runbook.md']);
    expect(result.provenance_only_files).toEqual(['legacy-db/schema.sql']);
    expect(result.rejected_files).toEqual([]);
    expect(result.unclassified_files).toEqual([]);
  });

  it('blocks when required arguments are missing', async () => {
    const missingProject = JSON.parse(await runArchiveImportEvaluate({
      candidate_paths: ['README.md'],
    })) as { status: string; block_reasons: string[] };
    const missingCandidates = JSON.parse(await runArchiveImportEvaluate({
      project_path: '/tmp/demo',
    })) as { status: string; block_reasons: string[] };

    expect(missingProject.status).toBe('BLOCK');
    expect(missingProject.block_reasons[0]).toContain('project_path is required');
    expect(missingCandidates.status).toBe('BLOCK');
    expect(missingCandidates.block_reasons[0]).toContain('candidate_paths is required');
  });
});
