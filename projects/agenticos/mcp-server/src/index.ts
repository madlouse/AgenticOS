#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VERSION = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version;

// Handle --version and --help before starting the MCP server
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(VERSION);
  process.exit(0);
}
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`agenticos-mcp — AgenticOS MCP Server v${VERSION}`);
  console.log('');
  console.log('Usage: agenticos-mcp [--version] [--help]');
  console.log('');
  console.log('Runs as a stdio MCP server. Configure in your AI tool\'s mcp.json:');
  console.log('  { "command": "agenticos-mcp", "args": [] }');
  console.log('');
  console.log('Environment:');
  console.log('  AGENTICOS_HOME  Workspace root (default: ~/AgenticOS)');
  process.exit(0);
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { initProject, switchProject, listProjects, getStatus, saveState, recordSession, runPreflight, runBranchBootstrap, runPrScopeCheck } from './tools/index.js';
import { getProjectContext } from './resources/index.js';

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
          path: { type: 'string', description: 'Optional custom path (defaults to $AGENTICOS_HOME/projects/{id}, i.e. ~/AgenticOS/projects/{id})' },
        },
        required: ['name'],
      },
    },
    {
      name: 'agenticos_switch',
      description: 'Switch to an existing AgenticOS project',
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
          message: { type: 'string', description: 'Optional commit message' },
        },
      },
    },
    {
      name: 'agenticos_status',
      description: 'Show status of the active project: last recorded time, current task, pending items, recent decisions.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'agenticos_preflight',
      description: 'Run machine-checkable guardrail preflight before implementation or PR creation. Returns JSON with PASS, BLOCK, or REDIRECT.',
      inputSchema: {
        type: 'object',
        properties: {
          issue_id: { type: 'string', description: 'GitHub issue number or identifier for the current task' },
          task_type: {
            type: 'string',
            enum: ['discussion_only', 'analysis_or_doc', 'implementation', 'bootstrap'],
            description: 'Classified task type',
          },
          repo_path: { type: 'string', description: 'Absolute repository or worktree path to evaluate' },
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
      name: 'agenticos_branch_bootstrap',
      description: 'Create an issue branch and isolated worktree from the intended remote base. Returns JSON with CREATED or BLOCK.',
      inputSchema: {
        type: 'object',
        properties: {
          issue_id: { type: 'string', description: 'GitHub issue number or identifier for the current task' },
          branch_type: { type: 'string', description: 'Branch prefix such as feat, fix, or chore' },
          slug: { type: 'string', description: 'Short task slug used to derive branch and worktree names' },
          repo_path: { type: 'string', description: 'Absolute repository path where the branch should be created' },
          remote_base_branch: { type: 'string', description: 'Remote base branch to branch from (default: origin/main)' },
          worktree_root: { type: 'string', description: 'Absolute root directory under which the new worktree should be created' },
        },
        required: ['issue_id', 'slug', 'repo_path', 'worktree_root'],
      },
    },
    {
      name: 'agenticos_pr_scope_check',
      description: 'Validate that the current branch diff is scoped to the intended issue relative to the intended remote base.',
      inputSchema: {
        type: 'object',
        properties: {
          issue_id: { type: 'string', description: 'GitHub issue number or identifier for the current task' },
          repo_path: { type: 'string', description: 'Absolute repository or worktree path to evaluate' },
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
      return { content: [{ type: 'text', text: await getStatus() }] };
    case 'agenticos_preflight':
      return { content: [{ type: 'text', text: await runPreflight(args ?? {}) }] };
    case 'agenticos_branch_bootstrap':
      return { content: [{ type: 'text', text: await runBranchBootstrap(args ?? {}) }] };
    case 'agenticos_pr_scope_check':
      return { content: [{ type: 'text', text: await runPrScopeCheck(args ?? {}) }] };
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
      description: 'Get context for the currently active project',
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
