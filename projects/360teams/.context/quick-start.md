# 360Teams OpenCLI - Quick Start

## Project Overview

把 360Teams 桌面 Electron 应用 CLI 化，让 AI Agent 通过 `opencli 360teams <cmd>` 访问即时通讯功能。

## Architecture

Commands use Playwright `connectOverCDP` to directly connect to the 360Teams Electron renderer process. No Chrome Extension or opencli daemon needed.

```
opencli 360teams <cmd>  →  cdp.js withElectronPage()  →  Playwright CDP  →  360Teams Electron (port 9234)
```

## Current Status

- Created: 2026-03-19
- Status: Active — CDP implementation complete

## Commands Available

- `status` — check CDP connection
- `me` — current logged-in user
- `contacts` — friend list
- `conversations` — recent chats
- `groups` — joined groups
- `send` — send a message

## Prerequisites

360Teams must be started with `--remote-debugging-port=9234`:

```bash
./start-debug.sh
```

## Key Files

- `clis/360teams/cdp.js` — CDP connection utility (`withElectronPage`)
- `clis/360teams/helpers.js` — pure data extraction functions (unit tested)
- `clis/360teams/*.js` — command implementations
- `start-debug.sh` — launch 360Teams with CDP enabled

## Environment Variables

- `TEAMS_CDP` — CDP endpoint (default: `http://localhost:9234`)
