#!/usr/bin/env node

// Handle --version and --help before starting the MCP server
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log('0.1.0');
  process.exit(0);
}
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('agenticos-mcp — AgenticOS MCP Server v0.1.0');
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
import { initProject, switchProject, listProjects, getStatus, saveState, recordSession } from './tools/index.js';
import { getProjectContext } from './resources/index.js';

const server = new Server(
  {
    name: 'agenticos-mcp',
    version: '0.1.0',
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
