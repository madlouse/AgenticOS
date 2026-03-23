# AgenticOS Agent Preflight and Execution Protocol

> Date: 2026-03-23
> Status: draft standard candidate
> Purpose: define a concrete preflight and execution contract that downstream agents can follow and future automation can enforce

## 1. Protocol Goal

This protocol exists to make agent work predictable, reviewable, and safe.

It defines:
- what an agent must understand before acting
- when an agent is allowed to edit files
- when branch/worktree isolation is mandatory
- what design loop must occur before implementation
- what verification must pass before submission

## 2. Task Classification

An agent must classify the task before acting.

### `discussion_only`

Allowed actions:
- analyze
- explain
- compare options
- propose designs

Disallowed actions:
- editing repository files
- creating implementation artifacts that change shipped behavior

### `analysis_or_doc`

Allowed actions:
- create or edit knowledge docs
- write issue drafts
- refine plans and protocols
- update non-runtime documentation

Constraints:
- may run in the main workspace only if no implementation-affecting files are touched
- still requires issue or accepted direction for non-trivial changes

### `implementation`

Examples:
- code changes
- workflow files
- scripts
- templates that downstream projects execute or inherit
- runtime-affecting documentation coupled to shipped behavior

Constraints:
- requires issue-first preflight
- requires task branch
- requires isolated worktree
- requires explicit verification before submission

### `bootstrap`

Applies when:
- repo has no initial commit
- branch/worktree flow cannot yet start normally

Constraints:
- only minimum baseline creation is allowed
- bootstrap scope must be explicit
- once baseline exists, normal implementation rules apply

## 3. Required Preflight

Before any file edits, the agent must produce a pass/fail result for this checklist.

### Repository checks

- repo identity known
- current branch known
- repo baseline state known
- active issue or accepted issue draft known

### Context checks

- project goal understood
- issue goal understood
- relevant constraints understood
- adjacent risks or related decisions reviewed

### Task checks

- task classified into one of the protocol types
- target files identified
- implementation impact assessed
- whether worktree is mandatory determined

### Execution checks

- acceptance criteria drafted before implementation
- verification method selected before implementation
- record/update obligations identified

If any required check fails, the agent must not proceed to implementation.

## 4. Mandatory Behavior by Task Type

### For `discussion_only`

The agent must:
- synthesize user intent
- load enough context to avoid local optimization
- keep outputs as analysis, options, or critique

The agent must not:
- silently transition into implementation

### For `analysis_or_doc`

The agent must:
- synthesize fragmented input into a coherent objective
- relate the task back to project-level goals
- perform at least one design-and-critique loop for non-trivial docs or protocol work
- define evaluation criteria before claiming completion

The agent must not:
- treat documentation edits as exempt if they change executable standards or downstream generated behavior without proper review

### For `implementation`

The agent must:
- confirm issue linkage
- create or use the correct branch
- work in an isolated worktree
- perform at least two design passes with critique in between for non-trivial work
- define executable acceptance criteria before editing
- verify before submission

The agent must not:
- implement directly in the protected active workspace
- implement directly on `main`
- skip verification because the change "looks small"

### For `bootstrap`

The agent must:
- keep scope to the minimum baseline needed for the repo to enter normal workflow
- identify what baseline files or commit are required
- stop treating the repo as bootstrap once the baseline exists

The agent must not:
- use bootstrap as an excuse to bypass the normal workflow for unrelated work

## 5. Design Loop Requirements

### Trivial work

One design pass may be acceptable only if:
- the change is local
- the risk is low
- no project-level contract is being changed

### Non-trivial work

Minimum required loop:

1. design pass 1
2. critique pass 1
3. design pass 2
4. executable acceptance definition

### High-risk or protocol work

Minimum required loop:

1. design pass 1
2. critique pass 1
3. design pass 2
4. critique pass 2
5. design pass 3
6. executable acceptance definition

High-risk includes:
- workflow rules
- standards and templates
- persistence logic
- context loading behavior
- branching or worktree rules
- security or data integrity sensitive code

## 6. Acceptance Criteria Format

Acceptance criteria should be written as checks, not adjectives.

Preferred forms:
- `if/then` behavioral rules
- pseudocode assertions
- command-based verification steps
- schema or file-state assertions
- rubric rows with pass/fail thresholds

### Example

Instead of:
- "Agent should load enough context"

Use:
- "Before implementation, the agent must read `quick-start`, `state.yaml`, and at least one issue-relevant knowledge file, then restate project goal, issue scope, and non-goals"

## 7. Verification Requirements

### Code changes

Required where applicable:
- build
- lint
- typecheck
- automated tests
- coverage for changed scope

Policy target:
- 100% coverage for changed logic surface

If the target is not met:
- record an explicit exception
- state why
- state residual risk
- do not claim full completion

### Non-code changes

Required:
- explicit evaluation rubric
- at least one structured evaluation pass
- evidence recorded in the task output, issue, or related artifact

Suitable evaluation methods:
- LLM-as-judge with rubric
- multi-pass evaluator prompts
- criteria checklist against acceptance rules

## 8. Submission Gate

An agent may submit or claim completion only if:
- preflight passed
- required design loop completed
- acceptance criteria existed before implementation
- verification evidence exists
- unresolved risks are disclosed

If any of the above is false, the correct output is not "done".
The correct output is a blocked or partial-completion state.

## 9. Suggested Pseudocode

```text
function run_agent_task(input, repo, issue):
  objective = synthesize_fragmented_input(input, issue)
  task_type = classify_task(objective, repo)
  preflight = run_preflight(repo, issue, task_type)

  if not preflight.passed:
    return blocked("preflight_failed", preflight.missing_items)

  design = draft_design(objective, repo, issue)
  critique = critique_design(design, repo, issue)
  design = refine_design(design, critique)

  if task_type in ["implementation", "protocol", "high_risk"]:
    critique_2 = critique_design(design, repo, issue)
    design = refine_design(design, critique_2)

  acceptance = define_executable_acceptance(design, task_type)

  result = implement(design)
  verification = verify_result(result, acceptance, task_type)

  if not verification.passed:
    return blocked("verification_failed", verification.failures)

  return submit(result, verification)
```

## 10. Downstream Implication

This protocol should eventually become:
- part of the canonical AgenticOS standard
- reflected in issue templates
- reflected in AGENTS.md and agent-specific overlays
- enforceable through helper commands, scripts, or guardrails
