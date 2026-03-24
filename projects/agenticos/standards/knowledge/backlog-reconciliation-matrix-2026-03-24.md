# Backlog Reconciliation Matrix - 2026-03-24

## Summary

This matrix reconciles the currently open backlog against landed self-hosting, standards consolidation, runtime extraction, guardrail, and standard-kit work on `origin/main`.

The goal is to make the remaining backlog match product reality, so future agents can trust GitHub issues as the canonical work queue.

## Disposition Legend

- `close-completed`
- `close-duplicate`
- `keep-open`
- `keep-open-rewrite`

## Matrix

| Issue | Title | Disposition | Rationale | Key References |
| --- | --- | --- | --- | --- |
| #22 | bug(record): JSON array strings serialized char-by-char into YAML facts/decisions | `close-duplicate` | Duplicates `#24` with a narrower description of the same record-array parsing bug. | `#24` |
| #23 | feat(switch): return full project context in switch output instead of just file paths | `keep-open` | Still valid. `agenticos_switch` now surfaces compact guardrail summary, but it still does not inline full project context. | PR `#77`, `knowledge/switch-guardrail-evidence-implementation-report-2026-03-24.md` |
| #24 | bug(record): array arguments passed as JSON strings get spread char-by-char into YAML | `keep-open` | Still reproducible from current `record.ts`. No defensive parsing exists yet. | `projects/agenticos/mcp-server/src/tools/record.ts` |
| #25 | fix: enforce project boundary isolation in recorded context | `keep-open-rewrite` | Core problem still matters, but the old contaminated-standards-repo example is no longer the canonical framing after standards retirement. | `knowledge/standalone-standards-retirement-resolution-2026-03-23.md`, `projects/agenticos/mcp-server/src/tools/record.ts` |
| #26 | feat: define canonical contracts for quick-start, state, conversations, and knowledge | `keep-open` | Still valid. Memory-layer expectations exist in scattered docs, but no single canonical contract spec has been finalized as the issue requests. | `knowledge/product-positioning-and-design-review-2026-03-22.md`, `knowledge/design-decisions.md` |
| #27 | feat: define executable agent protocol for Agent First and Agent Friendly | `close-completed` | The protocol, task classification, templates, and enforcement-oriented documentation now exist. | `knowledge/agent-preflight-and-execution-protocol-2026-03-23.md`, `knowledge/agent-execution-loop-2026-03-23.md`, PRs `#47`, `#48`, `#49`, `#50`, `#51` |
| #28 | feat: define sub-agent context inheritance and verification rules | `keep-open` | Still valid. The problem is documented, but no dedicated inheritance protocol or enforcement/reporting loop has landed yet. | `knowledge/open-source-workflow-research.md`, `knowledge/session-retrospective-2026-03-21.md` |
| #29 | feat: define per-agent bootstrap standard for AgenticOS integration | `keep-open-rewrite` | Partially satisfied by docs and local configuration work, but cross-agent bootstrap remains inconsistent and current docs are not fully normalized to the self-hosted structure. | `README.md`, `projects/agenticos/mcp-server/README.md`, `knowledge/product-positioning-and-design-review-2026-03-22.md` |
| #30 | feat: define Homebrew post-install bootstrap for supported agents | `keep-open-rewrite` | Partially satisfied, but the current Homebrew formula/tap/README surfaces are still inconsistent and not yet aligned with the latest bootstrap standard. | `projects/agenticos/homebrew-tap/Formula/agenticos.rb`, `projects/agenticos/homebrew-tap/README.md`, `README.md` |
| #31 | feat: define integration matrix for MCP-native and CLI+Skills fallback modes | `keep-open` | Still valid. The product has not yet made a canonical primary/fallback integration decision matrix. | `knowledge/product-positioning-and-design-review-2026-03-22.md` |
| #32 | feat: standardize issue-first and GitHub Actions based evolution workflow | `close-completed` | The workflow model is now defined and reflected in standards guidance and downstream packaging. | `knowledge/workflow-model-review-2026-03-23.md`, `knowledge/guardrail-flow-wiring-report-2026-03-23.md`, PR `#51` |
| #33 | feat: enforce agent compliance with issue-first branch and worktree workflow | `close-completed` | The core enforcement layer landed through guardrail commands and flow wiring. | PRs `#47`, `#48`, `#49`, `#50`, `knowledge/guardrail-command-trio-implementation-report-2026-03-23.md` |
| #34 | feat: define baseline bootstrap protocol for new AgenticOS project repositories | `close-completed` | The bootstrap protocol is explicitly documented. | `knowledge/baseline-bootstrap-protocol-2026-03-23.md` |
| #39 | feat: evaluate self-hosting workspace model for the AgenticOS product | `close-completed` | The evaluation led to an adopted model and completed migration. | `knowledge/self-hosting-workspace-model-2026-03-23.md`, `knowledge/self-hosting-migration-resolution-v1-2026-03-23.md`, PR `#46` |
| #41 | feat: define baseline isolation procedure before self-hosting migration | `close-completed` | The isolation procedure and execution report both landed before migration. | `knowledge/baseline-isolation-plan-2026-03-23.md`, `knowledge/baseline-isolation-execution-report-2026-03-23.md` |
| #42 | feat: prepare operator checklist for self-hosting migration baseline isolation | `close-completed` | The operator checklist landed and was used in the actual migration path. | `knowledge/operator-checklist-v1-2026-03-23.md`, PR `#46` |

## Outcome

The open backlog should now be treated as four categories:

1. Real remaining implementation gaps
   - `#23`
   - `#24`
   - `#26`
   - `#28`
   - `#31`

2. Real remaining standards gaps that need scope tightening
   - `#25`
   - `#29`
   - `#30`

3. Already-completed work that should be closed with references
   - `#27`
   - `#32`
   - `#33`
   - `#34`
   - `#39`
   - `#41`
   - `#42`

4. Duplicate cleanup
   - `#22` -> `#24`

## Next Step

After this matrix is recorded, `#79` should:

1. comment on each targeted issue with its disposition and references
2. close completed or duplicate issues
3. rewrite the bodies of `keep-open-rewrite` issues to reflect the current repository architecture
4. leave the remaining open backlog in a state that future agents can trust without reconstructing migration history
