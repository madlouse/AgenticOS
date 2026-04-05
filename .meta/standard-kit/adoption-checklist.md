# Downstream Adoption Checklist

Use this checklist when adopting the AgenticOS workflow standard in a downstream project.

## Project Files

- [ ] run `agenticos_standard_kit_adopt` or follow its equivalent workflow
- [ ] copy `.project.yaml` from the canonical template
- [ ] create `.context/quick-start.md`
- [ ] create `.context/state.yaml`
- [ ] create `tasks/templates/agent-preflight-checklist.yaml`
- [ ] create `tasks/templates/issue-design-brief.md`
- [ ] create `tasks/templates/non-code-evaluation-rubric.yaml`
- [ ] create `tasks/templates/sub-agent-handoff.md`
- [ ] create `tasks/templates/submission-evidence.md`

## Generated Agent Instructions

- [ ] generate or upgrade `AGENTS.md`
- [ ] generate or upgrade `CLAUDE.md`
- [ ] confirm the generated files contain the guardrail protocol
- [ ] confirm the generated files contain the compact task-intake rule for operator-intent resolution
- [ ] confirm the template marker version matches the current distill version

## Execution Expectations

- [ ] task intake resolves operator intent before workflow fragments are treated as the plan
- [ ] implementation work runs `agenticos_preflight`
- [ ] redirected implementation work uses `agenticos_branch_bootstrap`
- [ ] PR submission or merge runs `agenticos_pr_scope_check`
- [ ] implementation work uses issue-first branch naming and isolated worktrees
- [ ] delegated sub-agent work uses an explicit inheritance packet and verification echo

## Repository Boundary

- [ ] `.github/` is handled as repository-root infrastructure, not as project-scoped inherited content
- [ ] `.runtime/` and `.claude/worktrees/` are excluded from project-source inheritance

## Upgrade Readiness

- [ ] run `agenticos_standard_kit_upgrade_check` to inspect drift against the canonical kit
- [ ] copied templates are treated as project-owned after adoption
- [ ] generated files are allowed to upgrade through template version changes
- [ ] any future standard-kit upgrade is reviewed against local customizations
