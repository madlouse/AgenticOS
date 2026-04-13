#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VERSION = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version;

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { initProject, switchProject, listProjects, getStatus, saveState, recordSession, runPreflight, runIssueBootstrap, runBranchBootstrap, runPrScopeCheck, runHealth, runEditGuard, runEntrySurfaceRefresh, runStandardKitAdopt, runStandardKitUpgradeCheck, runStandardKitConformanceCheck, runNonCodeEvaluate, runArchiveImportEvaluate } from './tools/index.js';
import { getProjectContext } from './resources/index.js';
import { isDirectExecution, resolveCliPrelude } from './utils/mcp-server-cli.js';

const server = new Server(
  {
    name: 'agenticos-mcp',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'agenticos_init',
      description: 'Create a new AgenticOS project with standard structure',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Project name' },
          description: { type: 'string', description: 'Project description' },
          path: { type: 'string', description: 'Optional custom path (otherwise uses $AGENTICOS_HOME/projects/{id})' },
          topology: { type: 'string', enum: ['local_directory_only', 'github_versioned'], description: 'Required source-control topology for the project.' },
          context_publication_policy: { type: 'string', enum: ['local_private', 'private_continuity', 'public_distilled'], description: 'Context publication policy. local_directory_only projects use local_private; github_versioned projects must choose private_continuity or public_distilled.' },
          github_repo: { type: 'string', description: 'Required when topology is github_versioned. Use OWNER/REPO.' },
          normalize_existing: { type: 'boolean', description: 'When true, normalize an existing project directory/registry entry instead of failing closed.' },
        },
        required: ['name', 'topology'],
      },
    },
    {
      name: 'agenticos_switch',
      description: 'Bind the current MCP session to an existing AgenticOS project',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project ID or name' },
        },
        required: ['project'],
      },
    },
    {
      name: 'agenticos_list',
      description: 'List all AgenticOS projects',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'agenticos_record',
      description: 'Record session activity — conversations, decisions, outcomes. Call this after completing meaningful work and before ending any session. This is how the Agent maintains project memory.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Optional project ID, name, or path. If omitted, uses the current session project.' },
          summary: { type: 'string', description: 'What happened in this session (required)' },
          decisions: { type: 'array', items: { type: 'string' }, description: 'Key decisions made during this session' },
          outcomes: { type: 'array', items: { type: 'string' }, description: 'What was accomplished' },
          pending: { type: 'array', items: { type: 'string' }, description: 'What remains to be done next' },
          current_task: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Current task title' },
              status: { type: 'string', enum: ['in_progress', 'completed', 'blocked'], description: 'Task status' },
            },
            description: 'Update current task (optional)',
          },
        },
        required: ['summary'],
      },
    },
    {
      name: 'agenticos_save',
      description: 'Commit current state to Git and push. Call after agenticos_record to persist changes.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Optional project ID, name, or path. If omitted, uses the current session project.' },
          message: { type: 'string', description: 'Optional commit message' },
        },
      },
    },
    {
      name: 'agenticos_status',
      description: 'Show status of the current session project, or an explicit project when provided.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Optional project ID, name, or path. If omitted, uses the current session project.' },
        },
      },
    },
    {
      name: 'agenticos_preflight',
      description: 'Run machine-checkable guardrail preflight before implementation or PR creation. Target resolution prefers explicit project_path, then provable repo_path, then session-local binding, otherwise fails closed. Returns JSON with PASS, BLOCK, or REDIRECT.',
      inputSchema: {
        type: 'object',
        properties: {
          issue_id: { type: 'string', description: 'GitHub issue number or identifier for the current task' },
          task_type: {
            type: 'string',
            enum: ['discussion_only', 'analysis_or_doc', 'implementation', 'bugfix', 'bootstrap'],
            description: 'Classified task type',
          },
          repo_path: { type: 'string', description: 'Absolute repository or worktree path to evaluate' },
          project_path: { type: 'string', description: 'Optional managed project root when repo_path is a larger checkout or worktree.' },
          remote_base_branch: { type: 'string', description: 'Remote base branch to compare against (default: origin/main)' },
          declared_target_files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Files or path globs the task intends to touch',
          },
          structural_move: { type: 'boolean', description: 'Whether the task changes repository structure' },
          worktree_required: { type: 'boolean', description: 'Whether isolated worktree execution is mandatory' },
          root_scoped_exceptions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Repository-root infrastructure exceptions such as .github/',
          },
          clean_reproducibility_gate: {
            type: 'array',
            items: { type: 'string' },
            description: 'Required clean baseline verification commands such as npm ci and npm run build',
          },
        },
        required: ['task_type', 'repo_path'],
      },
    },
    {
      name: 'agenticos_edit_guard',
      description: 'Fail closed before implementation-affecting edits unless the resolved managed project identity, matching issue bootstrap evidence, and matching PASS preflight evidence already exist.',
      inputSchema: {
        type: 'object',
        properties: {
          issue_id: { type: 'string', description: 'GitHub issue number or identifier for the current edit.' },
          task_type: {
            type: 'string',
            enum: ['discussion_only', 'analysis_or_doc', 'implementation', 'bugfix', 'bootstrap'],
            description: 'Classified task type. Enforcement applies to implementation-affecting tasks.',
          },
          repo_path: { type: 'string', description: 'Absolute repository or worktree path where the edit would occur.' },
          project_path: { type: 'string', description: 'Optional explicit managed project root when repo_path is not itself inside the managed project.' },
          declared_target_files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exact target files the edit intends to mutate. Must remain inside the latest PASS preflight scope.',
          },
        },
        required: ['repo_path', 'task_type', 'declared_target_files'],
      },
    },
    {
      name: 'agenticos_issue_bootstrap',
      description: 'Record canonical issue-start evidence for the current issue after entering the intended branch/worktree, performing a clear-equivalent reset, and loading normal startup context. Guardrail target resolution prefers explicit project_path, then provable repo_path, then session-local binding.',
      inputSchema: {
        type: 'object',
        properties: {
          issue_id: { type: 'string', description: 'GitHub issue number or identifier for the current task.' },
          issue_title: { type: 'string', description: 'Current issue title.' },
          issue_body: { type: 'string', description: 'Current issue body or synthesized summary.' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Optional issue labels.' },
          linked_artifacts: { type: 'array', items: { type: 'string' }, description: 'Optional linked docs or artifacts required at issue start.' },
          additional_context: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['path', 'reason'],
            },
            description: 'Optional additional documents loaded after startup surfaces, with explicit reasons.',
          },
          context_reset_performed: { type: 'boolean', description: 'Whether the current agent session performed a clear-equivalent reset.' },
          project_hot_load_performed: { type: 'boolean', description: 'Whether the project then performed its normal startup context load.' },
          issue_payload_attached: { type: 'boolean', description: 'Whether the current issue payload became the active issue-scoped packet.' },
          repo_path: { type: 'string', description: 'Absolute repository or worktree path where this issue is being executed.' },
          project_path: { type: 'string', description: 'Optional explicit managed project root when repo_path is a larger checkout or worktree.' },
        },
        required: ['issue_id', 'issue_title', 'context_reset_performed', 'project_hot_load_performed', 'issue_payload_attached', 'repo_path'],
      },
    },
    {
      name: 'agenticos_branch_bootstrap',
      description: 'Create an issue branch and isolated worktree from the intended remote base. Guardrail target resolution prefers explicit project_path, then provable repo_path, then session-local binding. Returns JSON with CREATED or BLOCK.',
      inputSchema: {
        type: 'object',
        properties: {
          issue_id: { type: 'string', description: 'GitHub issue number or identifier for the current task' },
          branch_type: { type: 'string', description: 'Branch prefix such as feat, fix, or chore' },
          slug: { type: 'string', description: 'Short task slug used to derive branch and worktree names' },
          repo_path: { type: 'string', description: 'Absolute repository path where the branch should be created' },
          project_path: { type: 'string', description: 'Optional managed project root when repo_path is a larger checkout or worktree.' },
          remote_base_branch: { type: 'string', description: 'Remote base branch to branch from (default: origin/main)' },
          worktree_root: { type: 'string', description: 'Absolute root directory under which the new worktree should be created' },
        },
        required: ['issue_id', 'slug', 'repo_path', 'worktree_root'],
      },
    },
    {
      name: 'agenticos_pr_scope_check',
      description: 'Validate that the current branch diff is scoped to the intended issue relative to the intended remote base. Guardrail target resolution prefers explicit project_path, then provable repo_path, then session-local binding.',
      inputSchema: {
        type: 'object',
        properties: {
          issue_id: { type: 'string', description: 'GitHub issue number or identifier for the current task' },
          repo_path: { type: 'string', description: 'Absolute repository or worktree path to evaluate' },
          project_path: { type: 'string', description: 'Optional managed project root when repo_path is a larger checkout or worktree.' },
          remote_base_branch: { type: 'string', description: 'Remote base branch to compare against (default: origin/main)' },
          declared_target_files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Files or path globs the task intends to touch',
          },
          expected_issue_scope: { type: 'string', description: 'Short label describing the expected scope of the issue branch' },
        },
        required: ['issue_id', 'repo_path', 'declared_target_files'],
      },
    },
    {
      name: 'agenticos_health',
      description: 'Evaluate whether a canonical checkout and project context are fresh enough to trust before starting work.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_path: { type: 'string', description: 'Absolute repository checkout path to evaluate.' },
          project_path: { type: 'string', description: 'Optional absolute project path whose state freshness should be checked.' },
          remote_base_branch: { type: 'string', description: 'Remote base branch expected for canonical checkout freshness (default: origin/main).' },
          checkout_role: { type: 'string', enum: ['canonical'], description: 'Checkout role. Currently canonical-only.' },
          check_standard_kit: { type: 'boolean', description: 'Whether to include standard-kit drift in the health report.' },
        },
        required: ['repo_path'],
      },
    },
    {
      name: 'agenticos_refresh_entry_surfaces',
      description: 'Deterministically refresh the configured quick-start and state paths from structured merged-work inputs, honoring .project.yaml agent_context when present.',
      inputSchema: {
        type: 'object',
        properties: {
          project_path: { type: 'string', description: 'Absolute target project path whose entry surfaces should be refreshed.' },
          project_name: { type: 'string', description: 'Optional project name override when .project.yaml metadata is missing or stale.' },
          project_description: { type: 'string', description: 'Optional project description override used for quick-start project overview.' },
          issue_id: { type: 'string', description: 'Optional merged issue identifier that produced this refresh.' },
          summary: { type: 'string', description: 'Required concise summary of what just landed.' },
          status: { type: 'string', description: 'Required high-level project status label to surface in quick-start.' },
          current_focus: { type: 'string', description: 'Required current focus line for the refreshed entry surfaces.' },
          current_task_title: { type: 'string', description: 'Optional current task title override written into state.' },
          current_task_status: { type: 'string', description: 'Optional current task status override written into state.' },
          facts: { type: 'array', items: { type: 'string' }, description: 'Optional concise facts to persist into working memory and quick-start.' },
          decisions: { type: 'array', items: { type: 'string' }, description: 'Optional concise decisions to persist into working memory.' },
          pending: { type: 'array', items: { type: 'string' }, description: 'Optional next-work queue; the first item becomes Resume Here and next_step.' },
          report_paths: { type: 'array', items: { type: 'string' }, description: 'Optional landed report paths to include in loaded context and quick-start.' },
          recommended_entry_documents: { type: 'array', items: { type: 'string' }, description: 'Optional recommended entry documents for fast resume.' },
        },
        required: ['project_path', 'summary', 'status', 'current_focus'],
      },
    },
    {
      name: 'agenticos_standard_kit_adopt',
      description: 'Adopt the canonical AgenticOS downstream standard kit into a project by creating missing copied templates and generated guidance.',
      inputSchema: {
        type: 'object',
        properties: {
          project_path: { type: 'string', description: 'Absolute target project path. If omitted, uses explicit project, then the session-local current project.' },
          project: { type: 'string', description: 'Optional managed project id, name, or path when project_path is not provided.' },
          project_name: { type: 'string', description: 'Project name to use when creating missing .project.yaml or generated guidance.' },
          project_description: { type: 'string', description: 'Optional project description used for generated guidance.' },
        },
      },
    },
    {
      name: 'agenticos_standard_kit_upgrade_check',
      description: 'Check a project against the canonical AgenticOS downstream standard kit and report missing, stale, or diverged files without mutating them.',
      inputSchema: {
        type: 'object',
        properties: {
          project_path: { type: 'string', description: 'Absolute target project path. If omitted, uses explicit project, then the session-local current project.' },
          project: { type: 'string', description: 'Optional managed project id, name, or path when project_path is not provided.' },
          project_name: { type: 'string', description: 'Optional project name override used for reporting when .project.yaml is missing.' },
          project_description: { type: 'string', description: 'Optional project description override used for reporting.' },
        },
      },
    },
    {
      name: 'agenticos_standard_kit_conformance_check',
      description: 'Check whether a downstream project conforms to the canonical standard-kit workflow contract, not just the file package.',
      inputSchema: {
        type: 'object',
        properties: {
          project_path: { type: 'string', description: 'Absolute target project path. If omitted, uses explicit project, then the session-local current project.' },
          project: { type: 'string', description: 'Optional managed project id, name, or path when project_path is not provided.' },
          project_name: { type: 'string', description: 'Optional project name override used for reporting when .project.yaml is missing.' },
          project_description: { type: 'string', description: 'Optional project description override used for reporting.' },
        },
      },
    },
    {
      name: 'agenticos_non_code_evaluate',
      description: 'Validate a completed non-code evaluation rubric against the canonical contract and persist the latest structured evidence into project state.',
      inputSchema: {
        type: 'object',
        properties: {
          project_path: { type: 'string', description: 'Absolute project path whose latest non-code evaluation evidence should be updated.' },
          rubric_path: { type: 'string', description: 'Absolute or project-relative path to the completed rubric YAML file.' },
        },
        required: ['project_path', 'rubric_path'],
      },
    },
    {
      name: 'agenticos_archive_import_evaluate',
      description: 'Classify candidate archived files into active-source, provenance-only, reject, or unclassified before import.',
      inputSchema: {
        type: 'object',
        properties: {
          project_path: { type: 'string', description: 'Absolute project path whose archive import policy should be used.' },
          candidate_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Archive-relative candidate file paths to classify before import.',
          },
        },
        required: ['project_path', 'candidate_paths'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'agenticos_init':
      return { content: [{ type: 'text', text: await initProject(args) }] };
    case 'agenticos_switch':
      return { content: [{ type: 'text', text: await switchProject(args) }] };
    case 'agenticos_list':
      return { content: [{ type: 'text', text: await listProjects() }] };
    case 'agenticos_record':
      return { content: [{ type: 'text', text: await recordSession(args) }] };
    case 'agenticos_save':
      return { content: [{ type: 'text', text: await saveState(args) }] };
    case 'agenticos_status':
      return { content: [{ type: 'text', text: await getStatus(args ?? {}) }] };
    case 'agenticos_preflight':
      return { content: [{ type: 'text', text: await runPreflight(args ?? {}) }] };
    case 'agenticos_issue_bootstrap':
      return { content: [{ type: 'text', text: await runIssueBootstrap(args ?? {}) }] };
    case 'agenticos_edit_guard':
      return { content: [{ type: 'text', text: await runEditGuard(args ?? {}) }] };
    case 'agenticos_branch_bootstrap':
      return { content: [{ type: 'text', text: await runBranchBootstrap(args ?? {}) }] };
    case 'agenticos_pr_scope_check':
      return { content: [{ type: 'text', text: await runPrScopeCheck(args ?? {}) }] };
    case 'agenticos_health':
      return { content: [{ type: 'text', text: await runHealth(args ?? {}) }] };
    case 'agenticos_refresh_entry_surfaces':
      return { content: [{ type: 'text', text: await runEntrySurfaceRefresh(args ?? {}) }] };
    case 'agenticos_standard_kit_adopt':
      return { content: [{ type: 'text', text: await runStandardKitAdopt(args ?? {}) }] };
    case 'agenticos_standard_kit_upgrade_check':
      return { content: [{ type: 'text', text: await runStandardKitUpgradeCheck(args ?? {}) }] };
    case 'agenticos_standard_kit_conformance_check':
      return { content: [{ type: 'text', text: await runStandardKitConformanceCheck(args ?? {}) }] };
    case 'agenticos_non_code_evaluate':
      return { content: [{ type: 'text', text: await runNonCodeEvaluate(args ?? {}) }] };
    case 'agenticos_archive_import_evaluate':
      return { content: [{ type: 'text', text: await runArchiveImportEvaluate(args ?? {}) }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// List resources
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'agenticos://context/current',
      name: 'Current Project Context',
      description: 'Get context for the current session project',
      mimeType: 'text/markdown',
    },
  ],
}));

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri === 'agenticos://context/current') {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: await getProjectContext(),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

export async function main(
  argv: string[] = process.argv,
  writeLine: (line: string) => void = console.log,
  connect: () => Promise<void> = async () => {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  },
): Promise<number> {
  const prelude = resolveCliPrelude(argv, VERSION);
  if (prelude) {
    for (const line of prelude.lines) {
      writeLine(line);
    }
    return prelude.exitCode;
  }

  await connect();
  return 0;
}

if (isDirectExecution(process.argv, import.meta.url)) {
  main().then((exitCode) => {
    process.exit(exitCode);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
