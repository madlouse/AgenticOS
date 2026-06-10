# AgenticOS Capability Matrix And Design Map - 2026-06-10

## Audit Scope

This audit starts from `README.md`, then checks MCP README, design standards,
GitHub issues, MCP tool registration, code entrypoints, and tests. The issue
dataset refreshed on 2026-06-11 contained 280 issues: 272 closed and 8 open.

Issue data source:

```bash
gh issue list --state all --limit 1000 --json number,title,state,labels,createdAt,updatedAt,closedAt,url
```

Cluster counts are lightweight keyword buckets used for navigation, not a
partition of the issue set. One issue can appear in multiple capability
clusters when its design or implementation impact crosses boundaries.

## Capability Matrix

| Capability | README Promise | Primary Tools/Surfaces | Design Sources | Status | Open Gaps |
| --- | --- | --- | --- | --- | --- |
| Project lifecycle | Create and manage persistent projects | `agenticos_init`, `agenticos_project_resolve`, `agenticos_project_ensure`, `agenticos_list`, registry/project contract | `complete-design.md`, `architecture.md`, topology rubrics | Implemented and actively tested | Primary: `#521`; related: `#516`, `#514` |
| Context switching | Switch into projects and switch out to the original entry point | `agenticos_switch`, `agenticos_switch_out`, structured workdir result, activation Skill, Claude hook, Hermes applicator | switch reports, feature runtime standard | Implemented, hardened in `#540/#542`, released in `v0.4.37` | Primary: `#517`; related: `#516` |
| Continuity memory | Record, resume, and distill project work | `agenticos_record`, `agenticos_save`, cases, health, distillation ledger | memory layer, knowledge evolution audit | Implemented with health warnings | Primary: `#516`, `#517`; related: `#514` |
| Task/topic management | Track durable topic/project work | `agenticos_task_create/update/list/close`, `project_kind` | topic task contract, Hermes durable topic model | Implemented and smoke tested | No open issue in cluster |
| Guardrails/Git flow | Strict issue/worktree/preflight/review/merge workflow | preflight, edit guard, issue bootstrap, branch bootstrap, scope check, policy, cleanup | Git-backed workflow standard | Implemented and heavily tested | Primary: `#514`, `#519`; related: `#522`, `#547` |
| Bootstrap/agent support | Support Claude Code, Codex, Cursor, Gemini CLI, Hermes Agent | `agenticos-bootstrap`, activation Skills, config audit, hooks/applicators | per-agent bootstrap standard, runtime integration standard | Implemented, verified by Skill v8 matrix and local `v0.4.37` install | Primary: none; related: `#517`, `#519` |
| Standard kit | Apply downstream project guidance consistently | standard-kit adopt/check/conformance, AGENTS/CLAUDE/Cursor rule | standard kit design and reports | Implemented | Keep adapter wording aligned with switch-workdir contract |
| Evaluation/review | Use structured evaluation and sub-agent review | non-code evaluation, coverage check, multi-agent review, delegation validation | non-code evaluation, delegation protocols | Implemented | None open in cluster |
| Channel integrations | Optional Discord project-thread routing | external thread tools, Hermes router/worker dispatch, readiness checks | Discord rollout, Hermes routing scenarios | Optional integration implemented | No open issue in cluster |
| Release/Homebrew | Ship via GitHub release and Homebrew | release workflow, formula, bootstrap caveats, version freshness | Homebrew standards and release process | Operational but credential-sensitive; `v0.4.37` required manual release/tap recovery | `#547`, `#522` |

## MCP Tool Surface

The latest `mcp-server/src/index.ts` registers these capability groups:

- Project lifecycle and switching: `agenticos_init`, `agenticos_switch`,
  `agenticos_switch_out`, `agenticos_project_resolve`,
  `agenticos_project_ensure`, `agenticos_list`, `agenticos_status`.
- Optional external threads: `agenticos_external_thread_bind`,
  `agenticos_external_thread_get`, `agenticos_external_thread_list`.
- Durable tasks: `agenticos_task_create`, `agenticos_task_update`,
  `agenticos_task_list`, `agenticos_task_close`.
- Continuity and knowledge: `agenticos_record`, `agenticos_record_case`,
  `agenticos_list_cases`, `agenticos_save`.
- Health/config/state: `agenticos_config`, `agenticos_health`,
  `agenticos_canonical_sync`, `agenticos_refresh_entry_surfaces`.
- Guardrails and Git flow: `agenticos_preflight`, `agenticos_edit_guard`,
  `agenticos_issue_bootstrap`, `agenticos_branch_bootstrap`,
  `agenticos_pr_scope_check`, `agenticos_enforce_git_policy`,
  `agenticos_worktree_cleanup`.
- Standard kit and evaluation: `agenticos_standard_kit_adopt`,
  `agenticos_standard_kit_upgrade_check`,
  `agenticos_standard_kit_conformance_check`,
  `agenticos_non_code_evaluate`, `agenticos_archive_import_evaluate`,
  `agenticos_validate_delegation`, `agenticos_coverage_check`,
  `agenticos_multi_agent_review`.

## Issue Correspondence Summary

| Cluster | Issue Count | Open Issues | Notes |
| --- | ---: | --- | --- |
| Project lifecycle | 83 | `#521`, `#516`, `#514` | Strong implementation; remaining work is resolver/display polish and reconnect continuity. |
| Context switching | 31 | `#517` | Switch-out and workdir effects are released; remaining work is visibility/freshness around switch/status. |
| Continuity memory | 32 | `#517`, `#516`, `#514` | Capture, record, state, and health are implemented; freshness and reconnect need completion. |
| Task/topic management | 8 | none | Topic/task APIs and smoke tests landed. |
| Guardrails/Git flow | 74 | `#547`, `#522`, `#519`, `#514` | Guardrail primitives are strong; orchestration, release-token checks, and shared identity remain. |
| Bootstrap/agent support | 126 | `#533`, `#519`, `#517` | Broad cluster because it includes agent docs and routing issues; the supported-agent matrix itself is implemented. |
| Standard kit | 37 | none | Adapter surfaces are mature; keep wording aligned with switch-workdir contract. |
| Evaluation/review | 17 | none | Non-code evaluation, delegation, coverage, and review tools exist. |
| Channel integrations | 5 | none | Discord is optional, separate from Hermes Agent activation. |
| Release/Homebrew | 39 | `#547`, `#522` | v0.4.37 shipped; automated release/tap path still needs token and source-formula drift fixes. |

## Key Gaps

The repository has 8 open issues in total. The product/operations gaps below
exclude `#533`, which is this documentation hub issue.

- `#514`: shared checkout identity resolver remains the most important
  structural simplification for guardrail consistency.
- `#516`: session binding across MCP reconnect is still not complete.
- `#517`: freshness/drift warnings need to be more visible in status/switch.
- `#519`: users still need a single guardrail-chain entrypoint for issue start.
- `#521`: registry/user display labels need to be distinct from canonical ids
  and slugs.
- `#522`: Homebrew tap PAT handling needs an early-fail guard before release.
- `#547`: release workflow GitHub Release creation returned 401 during
  `v0.4.37`, leaving source-repo formula sync drift to repair.

## Open Issue Traceability Appendix

| Issue | Title | State | Primary Capability | Related Capabilities | Design Docs | Code/Test Surfaces | Rationale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#514` | guardrail(P0): extract unified checkout-identity resolver shared across record/save/preflight/edit_guard/pr_scope_check | open | Guardrails/Git flow | Project lifecycle, continuity memory | [guardrails-git-flow.md](capabilities/guardrails-git-flow.md), [project-lifecycle.md](capabilities/project-lifecycle.md), [continuity-memory.md](capabilities/continuity-memory.md) | `preflight.ts`, `edit-guard.ts`, `pr-scope-check.ts`, `record.ts`, `save.ts`, checkout identity tests | Multiple guardrail and continuity tools still need one resolver so project/worktree identity decisions stay consistent. |
| `#516` | continuity(P1): persist session project binding across MCP server reconnect | open | Continuity memory | Project lifecycle, context switching | [continuity-memory.md](capabilities/continuity-memory.md), [context-switching.md](capabilities/context-switching.md), [project-lifecycle.md](capabilities/project-lifecycle.md) | `project.ts`, `session-context.ts`, `issue-bootstrap-continuity.test.ts`, switch/status tests | Reconnect binding affects resume quality and whether switch/status outputs reflect the intended project after MCP restart. |
| `#517` | observability(P1): surface freshness/drift warnings in agenticos_status and switch output | open | Context switching | Continuity memory, bootstrap/agent support | [context-switching.md](capabilities/context-switching.md), [continuity-memory.md](capabilities/continuity-memory.md), [bootstrap-agent-support.md](capabilities/bootstrap-agent-support.md) | `project.ts`, `health.ts`, `knowledge-evolution-health.ts`, status/switch tests | Freshness and stale activation warnings must be visible at the moment agents decide which context to use. |
| `#519` | dx(P2): add a guardrail-chain orchestration entrypoint (agenticos_issue_start) | open | Guardrails/Git flow | Bootstrap/agent support | [guardrails-git-flow.md](capabilities/guardrails-git-flow.md), [bootstrap-agent-support.md](capabilities/bootstrap-agent-support.md) | `issue-bootstrap.ts`, `branch-bootstrap.ts`, `preflight.ts`, `edit-guard.ts`, `pr-scope-check.ts` | The primitives exist, but agents still need a composed issue-start workflow to reduce missed steps. |
| `#521` | model(P2): add registry display_name distinct from canonical name/slug | open | Project lifecycle | Standard kit | [project-lifecycle.md](capabilities/project-lifecycle.md), [standard-kit.md](capabilities/standard-kit.md) | `registry.ts`, `project-contract.ts`, `project-resolve.ts`, init/resolve tests | Human-readable names should not distort canonical ids, slugs, or path-based project resolution. |
| `#522` | ops(P1): configure HOMEBREW_TAP_PAT and add release early-fail guard | open | Release/Homebrew | Guardrails/Git flow | [release-homebrew.md](capabilities/release-homebrew.md), [guardrails-git-flow.md](capabilities/guardrails-git-flow.md) | `.github/workflows/release.yml`, `homebrew-tap/Formula/agenticos.rb`, release process docs | Release should surface missing tap credentials before a tag run reaches a half-manual state. |
| `#533` | docs: build AgenticOS capability matrix and design navigation hub | open | Evaluation/review | All capability modules | This document, [capabilities/README.md](capabilities/README.md), [agenticos-design-system-overview-2026-06-10.md](agenticos-design-system-overview-2026-06-10.md) | README, HTML hub, capability modules, delegation validation | This issue owns the current documentation hub and is excluded from product-gap counts. |
| `#547` | ops(P1): fix release workflow GitHub Release 401 and source formula sync drift | open | Release/Homebrew | Guardrails/Git flow | [release-homebrew.md](capabilities/release-homebrew.md), [guardrails-git-flow.md](capabilities/guardrails-git-flow.md) | `.github/workflows/release.yml`, source `homebrew-tap/Formula/agenticos.rb`, Homebrew tap formula | `v0.4.37` proved the binary and tap can be recovered manually, but workflow release token validation and source formula sync drift remain. |

## Agent Reading Path

1. Start at `README.md` for public positioning and install contract.
2. Use `mcp-server/README.md` for runtime/bootstrap details.
3. Read `standards/knowledge/capabilities/README.md` for capability modules.
4. For implementation work, jump from each module's mapping table to the named
   tools, utils, tests, and open issues.
