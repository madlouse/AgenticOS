# 360Teams OpenCLI Adapter

Agent-accessible CLI for 360Teams desktop app via Playwright CDP.

## Overview

Lets AI agents (and humans) interact with 360Teams instant messaging through `opencli 360teams <cmd>` — read messages, send messages, list contacts, list groups.

## Prerequisites

360Teams must be running with the remote debugging port enabled:

```bash
./start-debug.sh
```

Or manually:

```bash
pkill -f "360Teams.app" 2>/dev/null; sleep 1
open -n /Applications/360Teams.app --args --remote-debugging-port=9234
```

Verify CDP is reachable:

```bash
curl -s http://localhost:9234/json/list
```

## Commands

| Command | Description |
|---------|-------------|
| `opencli 360teams status` | Check CDP connection and show current user |
| `opencli 360teams me` | Get logged-in user details |
| `opencli 360teams contacts [--limit N]` | List contacts (default 50) |
| `opencli 360teams conversations [--limit N]` | List recent conversations (default 20) |
| `opencli 360teams groups` | List joined groups |
| `opencli 360teams send --to <ID> --msg <text> [--type PRIVATE\|GROUP]` | Send a message |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEAMS_CDP` | `http://localhost:9234` | CDP endpoint for 360Teams |

## Quick Start

```bash
# 1. Start 360Teams with CDP
./start-debug.sh

# 2. Wait for app to initialize
sleep 3

# 3. Check connection
opencli 360teams status

# 4. List your conversations
opencli 360teams conversations

# 5. Send a message
opencli 360teams send --to USER_ID --msg "hello from agent"
```

## Architecture

Commands connect directly to the 360Teams Electron renderer process via Playwright CDP (`connectOverCDP`). Each command opens a CDP connection, runs JS in the renderer, and closes the connection (~200-500ms overhead per call).

```
opencli 360teams <cmd>
        │
        ▼
   cdp.js: withElectronPage()
        │
        ▼
  Playwright connectOverCDP(localhost:9234)
        │
        ▼
  360Teams Electron renderer (app.$store, RongIM, etc.)
```

## Development

```bash
npm test          # run unit tests
npm run test:coverage
```

Tests cover pure helper functions in `helpers.js`. CDP integration requires a live 360Teams instance.
