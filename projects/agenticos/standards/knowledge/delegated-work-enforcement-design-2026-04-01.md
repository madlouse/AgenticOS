# Delegated Work Enforcement Design

> Issue: #95
> Date: 2026-04-01
> Status: design complete, implementation ready

---

## Problem Statement

Sub-agent inheritance rules and the handoff template (`tasks/templates/sub-agent-handoff.md`) are correct at the standards layer. The gap is runtime enforcement:
- No tool detects a missing or incomplete handoff packet
- No tool detects a missing verification echo from the sub-agent
- Nothing prevents a parent agent from recording delegated work that has no auditability trail

---

## Design Constraints

Per the issue:
- Do **not** redesign the protocol — it is already correct
- Add **minimum** runtime checks
- Enforcement semantics must align with existing guardrail pass/block/redirect behavior

---

## Chosen Approach: Extend `agenticos_record` with optional `delegation` field

### Why `agenticos_record`

`agenticos_record` is the only moment a parent agent surfaces delegated work outcomes in the system. Adding validation at record time:
1. Is the correct boundary — enforcement fires when work is committed, not during the delegation itself
2. Requires no new tool surface
3. Is opt-in via the `delegation` field — existing calls are unaffected

### Schema Extension

Add a `delegation` field to `agenticos_record` args:

```typescript
delegation?: {
  // Required for a complete handoff packet
  handoff_file?: string;          // path to the sub-agent-handoff.md used
  sub_task?: string;              // brief description of the delegated sub-task
  expected_output?: string;       // what was the expected output

  // Required for a complete verification echo
  verification_echo?: {
    restated_project?: string;    // sub-agent restated the project
    restated_task?: string;       // sub-agent restated the task
    restated_constraints?: string; // sub-agent restated key constraints
    evidence_returned?: string;   // what evidence was returned
  };
}
```

### Validation Logic

When `delegation` is provided in `agenticos_record`:

| Condition | Status | Output |
|-----------|--------|--------|
| `delegation` missing entirely | PASS (unaffected) | Normal record output |
| `delegation` present, all required fields populated, echo complete | PASS | Record output + `✅ Delegation validated` |
| `delegation` present, handoff packet fields missing | WARN | Record output + `⚠️ Delegation handoff packet incomplete: missing [fields]` |
| `delegation` present, verification echo missing | WARN | Record output + `⚠️ Delegation verification echo incomplete: missing [fields]` |
| Both handoff packet and echo missing | WARN | Record output + summary of both gaps |

**Initial enforcement: WARN, not BLOCK.** The first iteration surfaces the gap without breaking existing workflows. A follow-up issue can escalate to BLOCK after baseline is established.

---

## Auditability Path

When `delegation` is provided, it is persisted to the session conversation log alongside the standard record entry. This makes it auditable without a new data surface.

Format appended to `conversations/YYYY-MM-DD.md`:
```markdown
**Delegation record**:
- Sub-task: [sub_task]
- Handoff file: [handoff_file or "not provided"]
- Verification echo: [complete / incomplete — missing: ...]
```

---

## Fixture Cases

| Case | delegation field | Expected status |
|------|-----------------|----------------|
| No delegation field | omitted | PASS (unchanged) |
| Complete handoff + complete echo | all fields set | PASS + validated badge |
| Missing handoff fields | verification_echo only | WARN incomplete handoff |
| Missing echo fields | sub_task + handoff_file only | WARN incomplete echo |
| Both missing | `delegation: {}` | WARN both gaps |

---

## Files to Change

1. `projects/agenticos/mcp-server/src/tools/record.ts` — add `delegation` arg, validation logic, persistence
2. `projects/agenticos/mcp-server/src/tools/__tests__/record.test.ts` — add fixture cases
3. `projects/agenticos/.meta/templates/sub-agent-handoff.md` — add a note: "record this handoff with agenticos_record delegation field"

---

## Non-Goals

- Do not enforce delegation validation on non-delegation `agenticos_record` calls
- Do not introduce a new dedicated tool — extend the existing record surface
- Do not escalate to BLOCK in this iteration
