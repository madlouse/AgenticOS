# Hermes Discord Project Thread Rollout - 2026-05-22

## Purpose

This runbook covers the optional Hermes + Discord project-thread workflow after
the AgenticOS router and worker dispatch helpers landed.

The goal is to let a Discord message such as "切换到 AgenticOS 项目" enter a
durable AgenticOS project context, create or reuse a Discord project thread,
bind that thread privately, and start the selected execution worker without
polluting the main Hermes session.

## Compatibility Contract

- AgenticOS does not require Hermes.
- AgenticOS does not require Discord.
- Homebrew does not install Hermes, create Discord applications, write Discord
  credentials, or start a gateway.
- Machines without Hermes or Discord keep the normal AgenticOS MCP workflow.
- Discord is the only threaded surface in the MVP.
- Feishu thread routing is intentionally not supported in this rollout.
- Older AgenticOS installs that lack `agenticos_project_ensure`,
  `agenticos_external_thread_get`, or `agenticos_external_thread_bind` must be
  upgraded and restarted before threaded routing is claimed available.
- User-customized AgenticOS Skill files are not overwritten unless the operator
  reruns bootstrap with `--force-skills`.

## Automated Smoke Coverage

The fake E2E test lives at:

```text
mcp-server/src/utils/__tests__/hermes-discord-project-thread-smoke.test.ts
```

It verifies:

- project command parsing selects the explicit Claude Code backend when the
  user asks for Claude Code
- AgenticOS `project_ensure` runs before Discord thread work
- Discord thread creation happens before private thread binding
- worker dispatch records backend, session id, process id, and thread id
- worker progress is posted to the Discord project thread
- no-Discord mode still completes AgenticOS project ensure and reports that
  Discord routing was skipped

The test uses fake adapters only. It does not require network, Discord
credentials, Hermes, Codex, or Claude Code.

## Manual Discord Smoke Checklist

Run this only on a machine where Hermes, Discord credentials, and the execution
backend are intentionally configured.

1. Upgrade AgenticOS and restart long-lived agent sessions:

   ```bash
   brew update && brew upgrade agenticos
   agenticos-config --validate
   agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --verify --verify-hermes-discord
   ```

2. Confirm Discord prerequisites outside AgenticOS:

   - Discord application id is configured.
   - Discord bot token is configured in the Hermes runtime environment.
   - The bot can read and create threads in the target job channel.
   - The Hermes gateway has been restarted after credential changes.

3. In the Discord job channel, send:

   ```text
   切换到 AgenticOS 项目
   ```

   Expected result:

   - Hermes calls `agenticos_project_ensure`.
   - Hermes creates or reuses a `project/agenticos` Discord thread.
   - The origin channel response includes the thread link.
   - AgenticOS private sidecar contains a Discord binding.
   - No Feishu thread path is used.

4. In the same Discord job channel, send:

   ```text
   用 Claude Code 切换到 AgenticOS 项目，然后查看当前状态
   ```

   Expected result:

   - backend is `claude_code`
   - command availability is checked for `claude`
   - worker prompt includes AgenticOS MCP and explicit workdir guidance
   - worker started or blocked/setup status is posted inside the project thread

5. Send a default backend command:

   ```text
   切换到 AgenticOS 项目，然后查看当前状态
   ```

   Expected result:

   - backend defaults to `codex`
   - command availability is checked for `codex`
   - existing Discord binding is reused

6. Temporarily disable Discord configuration and retry a project command.

   Expected result:

   - AgenticOS project ensure still succeeds
   - response says Discord routing was skipped
   - no thread creation is claimed
   - no worker is claimed started from a missing thread

## Failure Handling

| Failure | Expected behavior | Recovery |
| --- | --- | --- |
| Missing `agenticos_project_ensure` | block project routing | upgrade AgenticOS and restart Hermes/agent sessions |
| Missing external thread binding tools | project ensure may succeed, Discord binding is skipped or blocked | upgrade AgenticOS, rerun bootstrap verification |
| Discord credentials missing | report optional Discord routing skipped | configure Hermes Discord env and restart gateway |
| Discord bot lacks thread permissions | worker/thread flow blocks with setup guidance | grant channel/thread permissions and retry |
| Selected Claude Code missing | worker blocks without changing thread mapping | install Claude Code or use Codex |
| Selected Codex missing | worker blocks without changing thread mapping | install Codex or explicitly use Claude Code |
| User-customized Skill exists | bootstrap verify reports stale/custom state | review file, then use `--force-skills` only if replacement is intended |

## Release Readiness

Before a release that advertises this workflow:

- fake E2E test passes
- `./tools/coverage-preflight.sh` passes
- `./scripts/readme-lint.sh` has no ERROR findings
- manual Discord smoke has been run on an intentionally configured machine, or
  release notes clearly mark real Discord validation as pending operator setup
- Homebrew caveats still state that Hermes/Discord are optional and not installed
  by Homebrew
