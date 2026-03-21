# AgenticOS — AI Contributor Guide

This file provides guidance for any AI coding agent (Claude, Codex, Cursor, Gemini, etc.) contributing to the AgenticOS repository.

## Project Overview

AgenticOS is an MCP server (`agenticos-mcp`) that provides AI-native project management. Source code is in `mcp-server/src/` (TypeScript).

## Quick Start

```bash
cd mcp-server
npm install
npm run build
```

## Contribution Rules

1. **Every change needs a GitHub Issue** — create one or reference an existing one
2. **Branch from main** — use `<type>/<issue-number>-<slug>` naming
3. **Conventional Commits** — `<type>(scope): <description>`
4. **Open a PR** — include `Closes #<issue-number>` in the body
5. **Do not modify** files under `projects/` (user data)

## Project Structure

```
mcp-server/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── tools/            # Tool implementations (init, switch, list, record, save, status)
│   ├── resources/        # MCP resource handlers
│   └── utils/            # Shared utilities (registry, distill)
├── package.json
└── tsconfig.json
```

## Testing

```bash
cd mcp-server && npm run build   # TypeScript strict compilation is the primary quality gate
```
