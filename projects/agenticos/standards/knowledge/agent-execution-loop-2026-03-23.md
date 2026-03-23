# AgenticOS Agent Execution Loop

> Date: 2026-03-23
> Purpose: convert fragmented user intent and issue-driven work into an executable agent workflow

## 1. Core Principle

User input may be fragmented, incomplete, or partially solution-shaped.

An AgenticOS-compatible agent should not respond only to the literal last sentence.
It should:
- synthesize fragmented inputs into a coherent objective
- infer the likely end goal, constraints, and quality bar
- propose the most suitable solution when the user's plan is incomplete
- improve the user's proposed solution when it is directionally correct but underspecified

This is a required behavior, not a style preference.

## 2. Issue Execution Must Start With Context

When an agent picks up an issue, it must not jump straight into implementation.

It must first load enough project context to answer:
- what is the project's long-term objective
- what system or product contract already exists
- what the current issue is trying to change
- how this issue interacts with adjacent decisions or risks

Minimum context loading should include:
- project quick-start and state
- relevant knowledge/design documents
- relevant issue and PR history
- agent-specific rules for the current repository

## 3. Required Execution Loop

For non-trivial tasks, the agent should follow this loop:

1. **Intent synthesis**
   Infer the user's real objective from fragmented input.
2. **Context loading**
   Read enough project material to understand the whole system.
3. **Task framing**
   Define the current problem, constraints, non-goals, and desired outcome.
4. **Design pass 1**
   Produce an initial design or solution path.
5. **Design critique**
   Challenge the initial design, identify weak assumptions, missing edge cases, and tradeoffs.
6. **Design pass 2**
   Produce a refined design.
7. **Optional design pass 3**
   Required for high-risk, architectural, or protocol-defining work.
8. **Acceptance definition**
   Define executable acceptance criteria before implementation.
9. **Implementation**
   Change code, docs, or other artifacts.
10. **Verification**
    Run the required checks.
11. **Only then submit**
    Commit, open/update MR or PR, and link verification evidence.

This is a `design -> critique -> redesign -> verify` workflow, not a one-shot generation workflow.

## 4. Acceptance Criteria Must Be Executable

Acceptance criteria should not remain purely narrative.

They must be written in an executable or operational form:
- code checks
- pseudocode-level protocol checks
- lint/test/build rules
- evaluation rubrics
- machine-checkable file or schema expectations

Bad example:
- "Agent should understand the project better"

Better example:
- "Before implementation, the agent must read `quick-start`, `state.yaml`, and at least one issue-relevant knowledge file, then restate project goal, issue goal, and implementation scope"

## 5. Verification Rules

### Code deliverables

For code changes, verification should include:
- build/lint/typecheck as applicable
- automated tests for changed behavior
- coverage for the changed scope

Operational recommendation:
- require **100% coverage for the changed scope or changed logic surface**
- if exact 100% cannot be achieved, require an explicit documented exception with reason and residual risk

This is a better operational interpretation than demanding arbitrary repository-wide 100% coverage on every issue.

### Non-code deliverables

For documentation, protocol, design, or analysis outputs, verification should use rubric-based evaluation.

Possible mechanisms:
- LLM-as-judge prompts against explicit rubrics
- multiple evaluator prompts or evaluator models
- checklist-based self-evaluation plus independent LLM evaluation
- comparison against issue acceptance criteria and source context

The key requirement is not "use an LLM somehow".
It is:
- evaluation criteria must be explicit
- evaluation should check goal satisfaction, not only writing quality
- the result should be recorded as evidence before submission

## 6. Suggested Pseudocode

```text
function execute_issue(issue, user_input, repo):
  objective = synthesize_intent(user_input, issue)
  context = load_project_context(repo, issue)
  task = frame_task(objective, context)

  design_v1 = draft_design(task)
  critique_v1 = challenge_design(design_v1, context)
  design_v2 = refine_design(design_v1, critique_v1)

  if task.is_high_risk or task.is_architectural:
    critique_v2 = challenge_design(design_v2, context)
    final_design = refine_design(design_v2, critique_v2)
  else:
    final_design = design_v2

  acceptance = define_executable_acceptance(final_design)

  implementation = implement(final_design)
  verification = verify(implementation, acceptance)

  if not verification.passed:
    return iterate_again()

  return submit_with_evidence(implementation, verification)
```

## 7. Product Implication

This protocol should shape:
- issue templates
- AGENTS.md and CLAUDE.md style agent instructions
- future automation and linting
- downstream project inheritance

Without this loop, "Agent First" stays aspirational.

With this loop, AgenticOS can begin to standardize predictable agent behavior.
