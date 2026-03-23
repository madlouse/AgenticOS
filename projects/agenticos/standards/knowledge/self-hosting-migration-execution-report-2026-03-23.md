# AgenticOS Self-Hosting Migration Execution Report

> Date: 2026-03-23
> Purpose: record the real execution and landing of the self-hosting migration for the AgenticOS product repository

## 1. Outcome

The self-hosting migration has now been executed and merged in the main AgenticOS repository.

Merged PR:
- PR #46 `refactor(repo): self-host AgenticOS under projects/agenticos (#40)`

Related issue:
- Issue #40 is now closed

## 2. What Landed

The merged migration established the following repository layout:

- AgenticOS product source now lives under `projects/agenticos/`
- standards content now lives under `projects/agenticos/standards/`
- agent command assets now live under `projects/agenticos/.claude/commands/`
- product implementation now lives under:
  - `projects/agenticos/mcp-server/`
  - `projects/agenticos/homebrew-tap/`
  - `projects/agenticos/.meta/`
  - `projects/agenticos/tools/`

## 3. Runtime and Workspace Semantics

The root repository now acts as the workspace home more explicitly.

Runtime-only areas were clarified as:
- `.runtime/`
- `.claude/worktrees/`

These are not canonical product source.

## 4. Important Design Correction

Execution revealed one important constraint that required correcting the original migration model:

- `.github` cannot move under `projects/agenticos/`

Reason:
- GitHub Actions workflow discovery remains repository-root scoped

So the landed model keeps:
- `.github/` at repository root

This means the final self-hosting model is slightly different from the earlier frozen draft:
- product source is self-hosted under `projects/agenticos/`
- but repository automation remains at root

## 5. Verification Evidence

The migration was verified from the relocated product path:

```bash
cd /Users/jeking/worktrees/agenticos-self-hosting-v2/projects/agenticos/mcp-server
npm install
npm run build
npm test
```

Observed result:
- install passed
- build passed
- test passed

CI on PR #46 also passed before merge.

## 6. Follow-Up Implication for Standards

The standards project should now treat the self-hosting model as:

- accepted
- executed
- slightly refined by the `.github` root-level exception

Future planning documents should avoid assuming that all product-source-adjacent directories can be nested under `projects/agenticos/`.
