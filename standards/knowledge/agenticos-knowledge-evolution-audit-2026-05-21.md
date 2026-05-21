# AgenticOS Knowledge Evolution Audit - 2026-05-21

## Purpose

Issue #440 asks whether AgenticOS actually evolves project knowledge in real
work, not only in product language or tests.

This audit compares three active samples:

| Sample | Local project id | Role in audit |
| --- | --- | --- |
| AgenticOS | `agenticos` | self-hosting product project with many issues, standards, releases, and guardrails |
| hermes-agent | `hermes-agent` | fast-moving integration project with Hermes, GBrain, and 360Teams work |
| Agentic CI/API | `agent-cli-api` | active execution project for provider switching, sessions, releases, and Homebrew workflows |

The evidence was gathered from `.project.yaml`, context state files, sidecar
conversation captures under `.agent-workspace`, knowledge/task directories,
recent Git history, and GitHub issue/PR state.

## Scorecard

Scale:

- `5` means the behavior is reliable and immediately reusable.
- `3` means the behavior works but needs manual interpretation or freshness checks.
- `1` means the surface exists mostly as intent, not dependable operation.

| Project | Capture quality | Distillation quality | State freshness | Task closure | Retrieval usefulness | Cross-session continuity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AgenticOS | 3 | 5 | 2 | 5 | 4 | 4 |
| hermes-agent | 5 | 4 | 3 | 4 | 4 | 4 |
| Agentic CI/API | 5 | 4 | 2 | 5 | 3 | 4 |

### AgenticOS

Observed evidence:

- `source_control.context_publication_policy` is `public_distilled`, so raw
  transcript isolation is intentional.
- Standards knowledge is extensive: about 100 standards knowledge files and 65
  task files in the audited checkout.
- Recent history shows strong issue/PR/release discipline, including v0.4.25
  release preparation, source formula sync, activation Skill bootstrap, and
  multiple project-switch/cwd fixes.
- Runtime sidecar captures are sparse for the recent period: 2 sidecar
  conversation entries were present for `agenticos`.
- Canonical operational state is stale relative to actual work. The audited
  `standards/.context/state.yaml` still centers older v0.4.5/root-git-exit
  work, while current main has moved through v0.4.25 and later issue work.
- Adapter surfaces are partially stale: `AGENTS.md` is template v15 while
  `CLAUDE.md` is v14.

Assessment:

AgenticOS has the strongest durable synthesis layer. Design decisions, command
contracts, implementation reports, release work, and guardrail records are
well represented in `standards/knowledge/`. The gap is not lack of knowledge;
the gap is freshness. A new agent can recover the product architecture, but the
entry state and latest runtime captures do not reliably point to the current
operating reality without GitHub and git-log cross-checking.

### hermes-agent

Observed evidence:

- `source_control.context_publication_policy` is `private_continuity`.
- The project has 11 knowledge files, 4 task files, 1 artifact file, and 16
  sidecar session entries across 2026-05-20 and 2026-05-21.
- The sidecar captures show high-quality execution records: summaries,
  outcomes, decisions, and pending items for GBrain remote-client correction,
  Hermes/360Teams callback debugging, outbound delivery validation, signing
  fixes, media support, install onboarding, ngrok service hardening, and title
  behavior.
- Several captured decisions were distilled into durable knowledge, including
  GBrain deployment/runbooks, remote MCP setup, personal assistant architecture,
  360Teams technical notes, rich-text guidance, and local identity.
- Git history confirms 18 commits since 2026-05-20, matching the captured
  iteration pace.
- The working tree currently contains user/WIP drift: modified README and
  GBrain docs plus untracked `artifacts/`, `knowledge/gbrain-read-write-verification.md`,
  and `scripts/verify-gbrain-read-write.sh`.
- Adapter entry surfaces are stale: both `AGENTS.md` and `CLAUDE.md` are
  template v13, while current AgenticOS standard-kit surfaces are newer.

Assessment:

hermes-agent is the best evidence that AgenticOS captures real iteration. The
raw execution history is detailed and actionable, and many decisions moved
into knowledge files. Its weakness is lifecycle hygiene: project state does
not automatically explain the latest WIP, dirty local drift, or whether a
session item has become durable knowledge, backlog, or finished work.

### Agentic CI/API

Observed evidence:

- Local project id is `agent-cli-api`; repository is `madlouse/Agent-CLI-API`.
- `source_control.context_publication_policy` is `private_continuity`.
- The project has 19 knowledge files, 7 task files, and 15 sidecar session
  entries across 5 capture files.
- Git history is very active: 52 commits since 2026-05-09 in the local main
  checkout.
- Sidecar captures show strong execution closure: issues, PRs, releases,
  Homebrew bumps, runtime validation, provider fixes, and multi-agent review
  loops are recorded with outcomes and decisions.
- Current GitHub issue and PR lists for the repository are empty at audit time.
- `.context/state.yaml` and `.context/quick-start.md` are stale: they still
  describe the 2026-03-31 standalone initialization era and early issues, not
  the May provider/session/release work.
- Adapter surfaces are stale at template v13.

Assessment:

Agentic CI/API proves the strongest execution loop: issues land, releases ship,
Homebrew validation happens, and open work is driven to zero. The durable
knowledge base is useful, especially for provider architecture and live
validation. The weak point is again freshness. A future agent reading only
`.context/quick-start.md` and `.context/state.yaml` would enter an old project
story and would need sidecar captures plus git/GitHub inspection to understand
the current state.

## Findings

1. AgenticOS is effective at preserving decisions and execution evidence when
   agents intentionally record or distill work.
2. The best real-world loops are issue/PR/release-oriented engineering loops.
   They produce high-quality capture and task closure.
3. Context freshness is the main systemic gap. In all three samples, the
   project can contain recent work while the entry state remains stale.
4. Raw session capture and durable knowledge are not connected by a measurable
   promotion state. The system can show that both exist, but it cannot prove
   which session records have been distilled, converted to tasks, or deliberately
   ignored.
5. Standard-kit freshness is visible but not automatically operationalized.
   Stale `AGENTS.md`/`CLAUDE.md` versions recur in downstream projects.
6. Dirty worktree/WIP state is not summarized into the project continuity
   model. hermes-agent currently demonstrates this clearly.

## Recommended Product Changes

Prioritized backlog:

1. Add a knowledge-evolution health surface that reports, per project:
   latest sidecar capture date, latest entry-state refresh date, latest
   knowledge file update, stale adapter template versions, and dirty worktree
   state.
2. Add a distillation ledger for session records with statuses such as
   `captured`, `distilled_to_knowledge`, `converted_to_task`, `superseded`, and
   `ignored_with_reason`.
3. Extend `agenticos_status` or `agenticos_health` to warn when registry
   `last_recorded`, sidecar captures, and `.context/state.yaml` disagree.
4. Add a standard-kit refresh issue path for projects whose adapter surfaces
   lag the current template version.
5. Define a lightweight topic lifecycle for non-code/personal evolution work.
   This should be designed in #441 rather than hidden inside engineering-project
   conventions.

## Conclusion

AgenticOS is already good at engineering continuity when the work flows through
issues, isolated worktrees, PRs, and explicit records. It is weaker as an
automatic knowledge-evolution OS because freshness, distillation status, and
topic lifecycle are not first-class measurable surfaces.

The next design pass should treat the evidence above as the baseline for #439:
AgenticOS has achieved a strong project-execution OS, but still needs explicit
knowledge-evolution telemetry and a lighter durable-topic path before it can
fully support Hermes-side personal and cognitive-growth workflows.
