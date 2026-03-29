# Issue Design Brief

## Issue
- ID: `#113`
- Title: `feat: fail closed when issue-first or active-project alignment is missing before edits`
- Linked source: `gh issue view 113 --repo madlouse/AgenticOS`

## Objective Synthesis
- User-stated request: continue from the RCA and implement an actual optimization path, not just more explanation.
- Inferred end goal: add an executable edit boundary so implementation-affecting work cannot silently bypass project alignment or issue/preflight alignment.
- Constraints:
  - stay inside isolated issue worktree `feat/113-fail-closed-edit-boundaries`
  - preserve a clear split between analysis issue `#112` and implementation issue `#113`
  - support both direct project repos and self-hosting/checkouts where the repository root is not itself the managed project root
- Non-goals:
  - do not redesign the full AgenticOS routing model
  - do not require silent mutation of Codex or Claude user configs
  - do not solve every registry migration problem in this issue

## Project Context
- Project long-term objective: AgenticOS should provide executable workflow boundaries, not just prompt-level reminders.
- Relevant existing design:
  - `agenticos_preflight` already classifies and validates implementation work
  - guardrail evidence is already persisted into project state when the project root is resolvable
  - `tools/record-reminder.sh` already proves the product accepts hook-friendly compatibility scripts
- Related issues/risks:
  - `#112` established that the missing guard is specifically at edit time
  - clean worktrees created from `origin/main` may still carry older registry structures, so the implementation should not depend on one exact repository topology
- Files or docs reviewed:
  - `projects/agenticos/mcp-server/src/index.ts`
  - `projects/agenticos/mcp-server/src/tools/preflight.ts`
  - `projects/agenticos/mcp-server/src/utils/guardrail-evidence.ts`
  - `projects/agenticos/mcp-server/src/utils/project-target.ts`
  - `tools/record-reminder.sh`

## Sub-Agent Inheritance Packet
- Sub-agent needed: no
- Delegated scope: none
- Project identity to pass: AgenticOS product source implementation issue `#113`
- Current task / issue context to pass: add minimal fail-closed edit boundary enforcement
- Constraints / non-goals to pass: no scope expansion into generic routing redesign
- Knowledge or task files to pass: this brief and issue `#112` RCA
- Expected output shape: one new guard tool, one hookable wrapper, tests, and bootstrap docs
- Verification the sub-agent must echo back: not applicable

## Design Pass 1
- Proposed approach:
  - add `agenticos_edit_guard` as an MCP tool that validates edit-time conditions
  - add `project_path` support so self-hosting/product-source checkouts can persist and read guardrail evidence even when `repo_path` is not itself inside a managed project root
  - add `tools/check-edit-boundary.sh` as a hook-friendly wrapper that calls the MCP tool and fails closed on `BLOCK`
- Why this approach:
  - MCP-only enforcement is too opt-in
  - hook-only enforcement without shared product logic would duplicate decision rules
  - this split keeps one canonical decision engine with one operator-facing wrapper
- Expected benefits:
  - edit-time enforcement becomes executable
  - the mechanism works for both direct project roots and nested product-source layouts
  - Codex/Claude/bootstrap docs can point to one real guard entrypoint

## Critique Pass 1
- Weak assumptions:
  - available edit hooks differ across agents, so wrapper adoption may still be tool-specific
  - preflight evidence is the right minimum proof for implementation edits
- Missing edge cases:
  - read-only investigation should not require edit guard PASS
  - declared target files may evolve after preflight
- Risks:
  - over-coupling the wrapper to one runtime layout
  - requiring registry membership where only `project_path` is actually knowable
- Better alternatives considered:
  - a new MCP tool only, with no wrapper
  - only a shell script, with no canonical MCP decision engine

## Design Pass 2
- Refined approach:
  - `agenticos_edit_guard` blocks only `implementation` work
  - it requires:
    - active project to match the intended project
    - issue id to be present
    - latest persisted preflight for the same issue and repo to exist and be `PASS`
    - attempted target files to remain within the preflight-declared target set
  - `project_path` becomes the explicit bridge when `repo_path` is a self-hosting checkout root rather than the managed project directory
- Changes from pass 1:
  - make declared-target subset checking part of the first version
  - make `project_path` explicit instead of trying to infer everything from the checkout root
- Why pass 2 is stronger:
  - it converts "did you remember to run preflight?" into a verifiable fact
  - it fails closed when topology is ambiguous instead of guessing

## Optional Design Pass 3
- Trigger reason: not needed
- Further refinement: not needed

## Executable Acceptance
- Behavioral checks:
  - `agenticos_edit_guard` blocks implementation edits when active project mismatches the intended project
  - `agenticos_edit_guard` blocks implementation edits when no matching `PASS` preflight evidence exists
  - `agenticos_edit_guard` blocks implementation edits when attempted targets exceed preflight-declared targets
  - `agenticos_edit_guard` passes once project alignment and matching preflight evidence exist
- File/state assertions:
  - guardrail evidence persistence accepts explicit `project_path`
  - one hook-friendly wrapper exists at both `projects/agenticos/tools/` and top-level `tools/`
- Verification commands:
  - targeted `vitest` for guardrail evidence and edit guard
  - `npm run build`
  - direct wrapper invocations for pass/block fixtures
- Evaluation rubric:
  - fail-closed behavior
  - no silent project inference when ambiguous
  - clear recovery output

## Implementation Plan
- Files expected to change:
  - `projects/agenticos/mcp-server/src/index.ts`
  - `projects/agenticos/mcp-server/src/tools/index.ts`
  - `projects/agenticos/mcp-server/src/tools/preflight.ts`
  - `projects/agenticos/mcp-server/src/tools/edit-guard.ts`
  - `projects/agenticos/mcp-server/src/tools/__tests__/edit-guard.test.ts`
  - `projects/agenticos/mcp-server/src/utils/guardrail-evidence.ts`
  - `projects/agenticos/mcp-server/src/utils/__tests__/guardrail-evidence.test.ts`
  - `projects/agenticos/tools/check-edit-boundary.sh`
  - `tools/check-edit-boundary.sh`
  - `README.md`
  - `projects/agenticos/mcp-server/README.md`
- Worktree required: yes
- Verification evidence to produce:
  - passing targeted tests
  - successful build
  - one blocked and one passing wrapper invocation
