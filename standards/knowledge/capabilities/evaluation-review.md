# Evaluation And Review

## 1. Overview

Evaluation and review tools let AgenticOS handle work that is not just code:
non-code rubrics, delegation logs, coverage evidence, archive import
classification, and multi-agent PR review.

Public surfaces:

- `agenticos_non_code_evaluate`
- `agenticos_validate_delegation`
- `agenticos_coverage_check`
- `agenticos_multi_agent_review`
- `agenticos_archive_import_evaluate`

User value: design docs, research, non-code artifacts, and PRs can receive
structured review evidence rather than informal chat approval.

## 2. Detailed Design

The review layer has several independent gates:

- Non-code evaluation validates completed rubric YAML and persists latest
  structured evidence.
- Delegation validation checks `log.md` and `result.md` artifacts.
- Coverage evidence records changed-scope coverage.
- Multi-agent review invokes specialized reviewers for code, security, QA,
  architecture, and performance.
- Archive import evaluation classifies provenance vs active source.

Invariants:

- Review evidence must be reproducible and stored in project context.
- Delegation artifacts must be validated before being used as completion proof.
- Coverage gates must match changed scope, not broad intent.
- Non-code evaluation must remain separate from source-code test claims.

Failure modes:

- Treating a sub-agent comment as proof without artifact validation.
- Using global coverage as evidence for changed-scope requirements.
- Importing archived files as active source without classification.

## 3. Implementation Mapping

| Surface | Files/Tests | Notes |
| --- | --- | --- |
| Non-code evaluation | `tools/non-code-evaluate.ts`, `non-code-evaluation.test.ts` | Rubric evidence. |
| Delegation validation | `tools/validate-delegation.ts`, `delegation-validation.test.ts` | Checks log/result artifacts. |
| Coverage | `tools/coverage-check.ts`, `coverage-evidence.ts`, tests | Changed-scope coverage evidence. |
| Multi-agent review | `tools/multi-agent-review.ts`, tests | PR review orchestration. |
| Archive import | `tools/archive-import-evaluate.ts`, tests | Classifies archived sources. |

Issue cluster: 17 evaluation/review issues. No open issue in this cluster at
refresh time.

Status: implemented with tests.

## Gaps

The main gap is operating discipline: agents must actually run and validate
review artifacts before claiming completion. #533 uses delegation evidence to
exercise this path.
