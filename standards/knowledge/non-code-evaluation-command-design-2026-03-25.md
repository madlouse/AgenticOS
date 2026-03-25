# Non-Code Evaluation Command Design

## Issue

- `#96` `feat: add rubric-backed non-code evaluation as a first-class command`

## Design Reflection

This issue should not introduce a second scoring system or hide judgment behind an opaque model call.
The canonical non-code rubric already exists. The missing capability is a first-class command that:

1. reads a completed rubric file
2. validates it against the canonical rubric contract
3. normalizes the result into deterministic structured evidence
4. persists that evidence in project state so later workflow surfaces can reference it

The right scope is therefore **rubric validation and evidence persistence**, not generic AI evaluation.

## Chosen Shape

Add one MCP command:

- `agenticos_non_code_evaluate`

The command will:

1. require a `project_path`
2. require a `rubric_path`
3. load the canonical template from `projects/agenticos/.meta/templates/non-code-evaluation-rubric.yaml`
4. validate that the provided rubric:
   - uses the canonical rubric name
   - supplies a non-empty artifact path and artifact type
   - uses an allowed artifact type
   - supplies a goal and linked issue
   - includes exactly the canonical criteria names
   - does not leave criteria in `pending`
   - sets `evaluation.overall_result` consistently with the criterion results
5. persist the normalized evidence to `.context/state.yaml`

## State Contract

Persist under:

```yaml
non_code_evaluation:
  updated_at: <iso timestamp>
  latest:
    command: agenticos_non_code_evaluate
    recorded_at: <iso timestamp>
    rubric_path: <project-relative path>
    artifact:
      path: <project-relative path>
      type: <artifact type>
    goal:
      intended_outcome: <string>
      linked_issue: <string>
    evaluation:
      method: llm_rubric_review
      passes_required: 1
      overall_result: PASS|FAIL
    criteria:
      - name: goal_alignment
        question: ...
        pass_threshold: ...
        result: PASS|FAIL
        notes: ...
    residual_risks:
      - ...
```

Also update:

```yaml
session:
  last_non_code_evaluation: <iso timestamp>
```

## Status Surface

`agenticos_status` and `agenticos_switch` should show a compact latest non-code evaluation summary.
This keeps the result visible without adding a second reporting channel.

## Non-Goals

- no LLM judge call inside the command
- no auto-generation of rubric content
- no historical append-only evaluation log in `state.yaml`
- no direct mutation of submission evidence files

## Verification

Implementation must prove:

1. deterministic validation and persistence with fixture rubric files
2. failure on malformed or incomplete rubric files
3. latest evaluation summary visible in `status` and `switch`
4. touched runtime files reach `100 / 100 / 100 / 100`
