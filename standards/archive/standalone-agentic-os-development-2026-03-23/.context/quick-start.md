# AgenticOS Development - Quick Start

## Project Overview
AgenticOS Development is the standards and product-definition project for AgenticOS itself. Its purpose is to evolve the canonical project structure, context model, agent behavior rules, and collaboration workflow that future important projects should follow, so any compatible agent can switch into a project, recover context quickly, and continue the work safely.

## Current Status
- Status: Active
- Product positioning has been clarified: this is the meta-project and standards project for the AgenticOS ecosystem
- Core goals are stable: durable human-agent context, sustainable evolution, and cross-agent collaboration
- A new design review has been recorded in `knowledge/product-positioning-and-design-review-2026-03-22.md`
- A concrete preflight/execution protocol draft is now being developed for agents
- Reusable protocol templates now exist in `tasks/templates/` for preflight, design briefs, evaluation, and submission evidence
- A downstream standard-package direction has been defined for packaging these templates and protocols into inheritable assets
- A bootstrap protocol is being defined for newborn repositories that do not yet have an initial commit
- A repository-layering review is being developed to separate standards, implementation, workspace data, and runtime byproducts
- The immediate practical rule is emerging: AgenticOS source repo and live AGENTICOS_HOME workspace should be separate
- A workspace migration plan is being defined for already tracked runtime projects under `projects/`
- A self-hosting migration plan is being defined in case the top-level AgenticOS directory becomes the workspace home
- A resolution draft now favors self-hosting while keeping other runtime projects largely unaffected
- A formal migration resolution v1 now freezes `projects/agenticos`, `projects/agenticos/standards/`, and `.runtime/` as the target model
- A Phase 2 path relocation checklist is being prepared for concrete root-path and standards-path moves
- A Phase 3 execution sequence is being prepared with verification-first checkpoints and rollback boundaries
- A command-level migration playbook v1 is being prepared, including exact verification commands and stop conditions
- A baseline isolation plan is being defined because the current root worktree is not clean enough for direct migration execution
- An operator checklist v1 now proposes a concrete base commit, migration branch, and external worktree path
- Baseline isolation was executed, the `#43` clean-install blocker was repaired, and the corrected replacement PR was merged as PR #45
- The self-hosting migration has now been executed and merged as PR #46
- The landed repository model now uses `projects/agenticos/` and `projects/agenticos/standards/`
- Execution refined the model with one important exception: `.github/` must remain at repository root for GitHub Actions workflow discovery
- `knowledge/self-hosting-migration-execution-report-2026-03-23.md` records the landed migration and the `.github` exception
- `knowledge/post-self-hosting-follow-up-plan-2026-03-23.md` now captures the next priorities after self-hosting landed
- The highest-value next work is now: guardrails, downstream standards packaging, and runtime project extraction
- `knowledge/agent-guardrail-design-v1-2026-03-23.md` now defines a concrete guardrail model driven by real execution failures
- `knowledge/agent-guardrail-command-contracts-v1-2026-03-23.md` now defines fixed I/O contracts for the first guardrail commands
- `knowledge/guardrail-preflight-implementation-report-2026-03-23.md` records the first landed guardrail implementation slice
- `knowledge/guardrail-command-trio-implementation-report-2026-03-23.md` records the landed implementation of the first three guardrail commands
- `knowledge/guardrail-flow-wiring-report-2026-03-23.md` records the merge that wired the guardrail trio into the main execution flow
- `knowledge/downstream-standard-kit-implementation-report-2026-03-23.md` records the landed downstream packaging artifact for reusable standards
- `knowledge/runtime-project-extraction-planning-report-2026-03-23.md` records the landed runtime-project classification and extraction-planning milestone
- `knowledge/runtime-project-extraction-execution-follow-up-2026-03-23.md` records the new execution issue that follows the planning milestone
- `tasks/templates/agent-preflight-checklist.yaml` has been expanded to include remote-base ancestry, PR scope, and reproducibility gates
- `agenticos_preflight` has now landed in the main product repository through PR #47
- `agenticos_branch_bootstrap` has now landed in the main product repository through PR #48
- `agenticos_pr_scope_check` has now landed in the main product repository through PR #49
- the first guardrail command trio is now executable in MCP and wired into product-facing workflow entry points through PR #50
- guardrail issue #36 is now functionally complete for v1
- downstream standard kit issue #35 has now landed through PR #51
- `projects/agenticos/.meta/standard-kit/` is now the canonical downstream packaging surface for reusable workflow standards
- runtime project extraction planning issue #38 has now landed through PR #52
- `projects/agenticos/.meta/runtime-project-classification.yaml` is now the machine-readable classification source for tracked `projects/*`
- layer-model issue #37 is now closed as a completed definition milestone
- runtime-project extraction execution now has its own follow-up issue: #53
- runtime extraction wave 1 for `2026okr` and `360teams` has now been executed locally and recorded in `knowledge/runtime-project-extraction-wave1-report-2026-03-23.md`
- the live workspace registry now points `2026okr` and `360teams` to `/Users/jeking/AgenticOS/projects/*`
- the source-repo extraction commit `9638a99` is now published on branch `feat/53-runtime-project-extraction`
- PR `#54` has now been merged for runtime extraction wave 1
- runtime extraction wave 2 for `agentic-devops` and `ghostty-optimization` has now been merged as PR `#55`
- the live workspace registry now also points `agentic-devops` and `ghostty-optimization` to `/Users/jeking/AgenticOS/projects/*`
- `knowledge/runtime-project-extraction-wave2-report-2026-03-23.md` records the split-brain extraction wave and the remaining blocker
- issue `#53` is now closed
- issue `#56` is now also closed after removing the orphaned gitlink residues `okr-management` and `t5t`
- `knowledge/runtime-project-extraction-closure-report-2026-03-23.md` records the final completed state of the extraction program
- the publication blocker was traced to Git's global HTTPS proxy path (`127.0.0.1:7897`) rather than to GitHub availability itself
- issue `#58` has now landed and been merged as PR `#59`
- `knowledge/git-transport-fallback-documentation-report-2026-03-23.md` records the new canonical operator procedure for GitHub transport failure diagnosis and fallback
- issue `#60` has now also landed and been merged as PR `#61`
- `knowledge/git-transport-http11-refinement-report-2026-03-23.md` records the final `HTTP/1.1` compatibility refinement for this machine's Git HTTPS behavior
- issue `#62` has now landed and been merged as PR `#65`
- `knowledge/guardrail-evidence-persistence-implementation-report-2026-03-23.md` records the automatic persistence of bounded guardrail execution evidence into project state
- no real runtime projects remain tracked under `projects/`; only `projects/agenticos` and fixture candidate `projects/test-project` remain
- A first batch of issue drafts has been created in `tasks/issue-drafts/`
- The largest current risks are project-boundary pollution, weak context-loading guarantees, and overly abstract agent-behavior principles
- A new cross-agent bootstrap gap has been identified: MCP and intent-recognition are not yet consistently wired across Claude Code and Codex
- Homebrew installation is also incomplete as a product experience: binary install works, but per-agent MCP/bootstrap still requires explicit follow-up

## Next Steps
1. Review and refine the issue drafts in `tasks/issue-drafts/`
2. Publish the highest-priority drafts as GitHub Issues
3. Decide whether downstream standard-kit adoption and upgrade should become first-class commands
4. Decide whether standards-repo records should now be cleaned up and committed under the same issue-first flow
5. Decide whether quick-start/status surfaces should summarize the latest persisted guardrail evidence more explicitly
