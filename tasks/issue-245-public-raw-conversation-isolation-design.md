# Issue #245 Technical Design: Public Raw Conversation Isolation

## Purpose

Define the implementation plan for making `github_versioned + public_distilled`
projects keep raw session history out of the tracked public tree while
preserving usable agent continuity.

This issue is the public-policy counterpart to `#244`.

- `#244` covers full tracked continuity for `private_continuity`
- `#245` covers raw transcript isolation for `public_distilled`

These two contracts must stay separate, but they must share one policy/path
authority.

## Problem Restatement

The publication-policy contract already says:

- `private_continuity`
  - full tracked continuity may remain in repo
- `public_distilled`
  - distilled continuity may be tracked
  - raw session history must not remain in the tracked public tree

But current product behavior does not enforce that distinction.

Current state:

1. templates still default:
   - `agent_context.conversations: ".context/conversations/"`
2. `agenticos_record` always writes to the configured conversations dir
3. `agenticos_save` has no publication-policy-aware transcript branching
4. generated guidance, entry surfaces, standard-kit docs, and memory contract
   wording still broadly treat `.context/conversations/` as the canonical
   append-only session history path

So `public_distilled` is currently only a declared contract, not an end-to-end
implemented behavior.

## Goal

For `source_control.context_publication_policy = public_distilled`:

- raw session history must be routed to a private sidecar path
- tracked source should retain only publishable / distilled continuity surfaces
- `record`, `save`, resume guidance, generated docs, and conformance checks
  must all describe the same contract
- operators must understand what is recoverable from Git alone and what still
  requires private sidecar continuity

## Non-Goals

Do not solve these in `#245`:

- full tracked continuity for private repos
  - belongs to `#244`
- general backup surface redesign
- runtime-home / session-local project resolution
- estate-wide automatic migration tooling across all projects
- rewriting old transcript history automatically

## Design Principles

### 1. Policy-Driven Routing

Transcript routing must be derived from:

- topology
- context publication policy
- configured agent context paths

Do not treat `.private/conversations/` as a hidden convention with no contract.

### 2. One Shared Validated Path Contract

`#244` and `#245` must consume one shared validated policy/path layer.

Do not let:

- `continuity-surface.ts`
- `conversation-routing.ts`
- `save.ts`
- `record.ts`
- templates
- generated guidance

all independently reconstruct policy/path behavior.

The shared layer must own:

- publication policy resolution
- absolute/display/repo-relative path normalization
- project-root and repo-root validation
- raw conversation destination
- tracked continuity set
- sidecar-only exclusions

Do not add a second authority that re-derives policy, repo identity, or raw
paths independently. Any helper introduced in `#245` must be a pure derived
view over the shared plan, not a parallel planner with its own routing logic.

### 3. Separate “Tracked Continuity” From “Private Raw History”

For `public_distilled`, there are two different path classes:

1. tracked, publishable continuity
2. private, append-only raw session history

The product must stop pretending one path can satisfy both.

### 4. Private Sidecar Must Remain Project-Scoped

Raw transcript isolation should remain project-scoped and easy to reason about.

Canonical sidecar path for `#245`:

- `.private/conversations/`

Compatibility note:

- `.meta/transcripts/` may remain a legacy/future compatibility alias
- it should not remain co-equal or operator-facing canonical truth

### 5. No Silent Public Leakage

Once `public_distilled` behavior is implemented:

- `agenticos_record` must stop appending raw sessions to tracked
  `.context/conversations/`
- `agenticos_save` must not stage raw sidecar transcript paths
- docs/templates/guidance must not keep describing `.context/conversations/`
  as the raw canonical path for public projects

This is stronger than “`agenticos_save` does not add those files”.
Guardrails, conformance, and generated ignore guidance must all make it harder
to accidentally publish private raw transcript paths.

### 6. Keep `agent_context.conversations` Semantically Stable

`agent_context.conversations` should remain the configured project-scoped
context/display path, not become the policy-derived raw append destination for
`public_distilled`.

For `public_distilled`:

- the raw append target is policy-derived
- the tracked/display path may remain `.context/conversations/`
- generated guidance must clearly distinguish tracked continuity from private
  raw history

Do not repoint the field to `.private/conversations/` and collapse those two
concepts back together.

## Operator Contract

The product should publish one canonical operator matrix across docs and code:

| Policy | Raw conversation write path | Tracked continuity in repo | `record` truth | `save` truth | Recovery guarantee |
| --- | --- | --- | --- | --- | --- |
| `local_private` | configured conversations path | local only | raw history written locally | narrow runtime behavior | Git is not the recovery mechanism |
| `private_continuity` | configured conversations path | full tracked continuity | raw history stays tracked | full continuity staged | fresh private clone restores usable continuity |
| `public_distilled` | `.private/conversations/` | distilled tracked continuity only | raw history written to sidecar | sidecar excluded from tracked save | fresh public clone restores distilled continuity only; raw history requires sidecar |

For `#245`, the minimum tracked continuity contract for `public_distilled`
must be machine-checkable and explicit.

Required tracked continuity set:

- `.project.yaml`
- configured quick-start path
- configured state path
- configured knowledge directory
- configured tasks directory
- selected project-level guidance surfaces when they are intended to be tracked

Not part of the tracked public contract:

- raw append-only session history
- `.private/conversations/`
- `.meta/transcripts/` raw sidecar content

Config note:

- `agent_context.conversations` remains a configured tracked/display path
- raw transcript write destination is derived from publication policy, not read
  directly from that field for `public_distilled`

## Current-State Analysis

### Template Drift

`.meta/templates/.project.yaml` still defaults:

- `agent_context.conversations: ".context/conversations/"`

That is acceptable for:

- `local_private`
- `private_continuity`

But it is misleading as universal operator truth once `public_distilled`
becomes real behavior.

### Runtime / Guidance Drift

Current product surfaces still teach one universal conversations path:

- `record.ts`
- `distill.ts`
- `entry-surface-refresh.ts`
- `.meta/templates/quick-start.md`
- `.meta/standard-kit/README.md`
- memory contract standards

If runtime starts writing `public_distilled` transcripts to sidecar while those
surfaces still teach `.context/conversations/`, the product will keep
reintroducing the wrong mental model.

### Legacy Public Projects

Existing public projects may already contain tracked raw transcripts under
`.context/conversations/`.

If `#245` simply switches new writes to sidecar with no rollout rule, the
system risks:

- operators reading stale public raw history as if it were current
- silent dual-write assumptions
- unexpected staged transcript diffs
- no clear migration guidance

## Proposed Solution

## A. Reuse The Shared Policy / Path Resolver

`#245` must consume the same shared validated policy/path utility introduced for
`#244`.

Suggested shared utility:

- `mcp-server/src/utils/context-policy-plan.ts`

This shared layer should already answer:

- active publication policy
- authoritative project root and repo root
- configured tracked context paths
- raw conversation destination
- tracked conversation path, if any
- sidecar-only paths
- repo-boundary violations

`#245` should not duplicate that logic in `record.ts`.

## B. Add At Most A Derived Conversation Routing Helper

If a helper is added for `record` / `save` / messaging, it must be a pure
derived view over `ContextPolicyPlan`, not a second routing authority.

Allowed shape:

```ts
interface ConversationRoutingPlan {
  policy: 'local_private' | 'private_continuity' | 'public_distilled';
  raw_conversations_dir: string;
  tracked_conversations_dir: string | null;
  is_sidecar: boolean;
  tracked_recovery_contract: 'local_only' | 'git_full' | 'git_distilled';
  notes: string[];
  legacy_transcript_status:
    | 'none'
    | 'tracked_legacy_present'
    | 'tracked_legacy_dirty'
    | 'misconfigured_public_raw_target';
}
```

This helper may summarize:

- the already-resolved raw append-only session history path
- whether that path is tracked or sidecar-only
- what tracked path, if any, remains part of the public continuity contract
- whether legacy tracked raw transcripts are present and need operator action

It must not independently re-resolve:

- repo root
- project root
- publication policy
- tracked continuity paths
- raw destination paths

## C. Canonical Routing Rules

### `local_private`

- raw conversations remain in configured conversations dir
- current behavior may stay unchanged

### `private_continuity`

- raw conversations remain in configured conversations dir
- tracked repo continuity may include them
- this is primarily exercised by `#244`

### `public_distilled`

Canonical behavior:

- raw conversations write to `.private/conversations/`
- tracked `.context/conversations/` is not the raw append target
- `.meta/transcripts/` is not co-equal canonical behavior

Rationale:

- `.private/` is semantically clear
- existing code already hints at sidecar-only intent
- it is easier to explain and enforce than a dual-use tracked path

## D. Record Command Contract

`agenticos_record` should stop using the configured tracked conversations path
as the raw destination directly.

Instead it should:

1. resolve the managed project target
2. build `ContextPolicyPlan`
3. validate repo-boundary conditions
4. derive any routing/status helper strictly from `ContextPolicyPlan`
5. if legacy public tracked raw transcripts require operator action, follow the
   explicit rollout rule
6. append session history to `raw_conversations_dir`
7. report the actual written path and recoverability truth in the tool result

For `public_distilled`, tool output must stop hard-coding:

- `Conversation: .context/conversations/...`

It should instead report:

- actual raw sidecar file written
- whether that path is tracked or sidecar-only
- whether Git alone restores only distilled continuity

## E. Save Contract For Public Projects

`agenticos_save` should align with the shared policy/path contract so that:

- `record` writes raw history into sidecar
- `save` excludes raw sidecar transcripts
- tracked source retains only publishable continuity surfaces
- result text explains that raw history is not part of Git recovery

`#245` must also harden the tracked save model for `public_distilled`.
It is not enough to route `record` correctly if `save` still stages only the
old runtime surface.

Required save behavior for `public_distilled`:

- consume the same policy-derived tracked continuity contract used by docs and
  conformance
- keep the minimum tracked continuity set machine-checkable:
  - `.project.yaml`
  - quick-start
  - state
  - knowledge
  - tasks
  - selected tracked guidance surfaces
- update `runtime-review-surface.ts` so tracked vs sidecar paths reflect policy
- ensure raw sidecar paths are excluded from normal tracked save
- explain in result text that Git recovery is distilled-only

Leakage barrier requirements:

- legacy committed tracked transcripts may remain as historical evidence
- new raw writes must not continue there
- if a `public_distilled` project has staged or unstaged raw-transcript changes
  under tracked paths, `save` must fail closed instead of silently publishing
  them
- if sidecar raw transcript paths appear in tracked diff / review scope,
  guardrails or conformance must flag or fail them

`#245` should also define how `save` behaves when legacy public tracked raw
transcripts still exist:

- historical tracked transcripts remain readable as historical evidence
- new raw writes do not continue there
- sidecar raw history remains excluded from tracked save
- operator receives an explicit note or warning

## F. Template / Init / Entry-Surface Contract

`#245` cannot stop at routing code. Completion must include operator-surface
truthfulness.

Required scope:

- `init.ts`
- `.meta/templates/.project.yaml`
- `.meta/templates/quick-start.md`
- `distill.ts`
- `entry-surface-refresh.ts`
- standard-kit generated guidance / README wording
- memory contract / publication-policy docs where they still present
  `.context/conversations/` as universal canonical raw history

Recommended rule:

- keep schema stable
- make runtime routing policy-aware
- update comments/docs/generated guidance so `public_distilled` truth is explicit
- make session-start guidance policy-aware so public projects do not treat raw
  sidecar history as required Git-backed startup context

`init` / `normalize_existing` requirements:

- do not rewrite `agent_context.conversations` to `.private/conversations/`
- do not treat that field as the live raw append target for `public_distilled`
- comments and generated files must explicitly say raw conversation routing is
  policy-derived and may differ from the tracked/display path
- directory creation for `public_distilled` must be intentional:
  - create the sidecar raw path when needed
  - do not imply that tracked `.context/conversations/` is the active raw sink

## G. Legacy Rollout And Migration Contract

`#245` needs an explicit compatibility rule for existing public projects with
tracked raw transcripts already under `.context/conversations/`.

Recommended rollout behavior:

1. classify legacy state explicitly:
   - `tracked_legacy_present`
   - `tracked_legacy_dirty`
   - `misconfigured_public_raw_target`
2. legacy committed tracked transcripts remain historical evidence and remain
   readable
3. new raw writes switch to `.private/conversations/`
4. `agenticos_save` does not continue publishing new raw transcripts
5. no silent dual-write mode
6. no automatic destructive relocation in this issue
7. migration guidance must point to an explicit migration workflow aligned with
   the post-`#262` hybrid migration model rather than a vague future cleanup

Warn / block contract:

- `tracked_legacy_present`
  - allow `record`
  - allow `save` if no new tracked raw transcript changes are present
  - warn persistently in operator-facing surfaces until migration/cleanup is
    complete
- `tracked_legacy_dirty`
  - block `save`
  - explain that tracked raw transcript changes would leak new private history
- `misconfigured_public_raw_target`
  - block `record`
  - block `init normalize_existing`
  - fail closed until raw destination is sidecar-only and inside the project

Visibility requirements:

- surface this status in `record`
- surface it in `save`
- surface it in switch/status operator output
- surface it in conformance / audit results

This keeps behavior safe while avoiding automatic history rewriting.

## H. Docs / Conformance Are Part Of Completion

`#245` should not be considered complete if only runtime routing changes land.

Completion criteria must include:

- README truthfulness
- template truthfulness
- generated guidance truthfulness
- standard-kit truthfulness
- conformance checks that detect contradictory public-project semantics
- standard-kit manifest behaviors that actually encode the public-project truth
- guardrail / review-surface checks that reject private raw transcript leakage

Otherwise the product will keep regenerating the old contract.

## File-Level Change Plan

### New

- `mcp-server/src/utils/conversation-routing.ts`
  - only if implemented as a pure derived view over `ContextPolicyPlan`
- `mcp-server/src/utils/__tests__/conversation-routing.test.ts`

### Update

- `mcp-server/src/tools/record.ts`
- `mcp-server/src/tools/__tests__/record.test.ts`
- `mcp-server/src/tools/save.ts`
  - align exclusion, blocking, and operator reporting behavior
- `mcp-server/src/tools/init.ts`
- `mcp-server/src/tools/project.ts`
  - switch/status-facing legacy public transcript notices
- `mcp-server/src/tools/pr-scope-check.ts`
  - flag private raw transcript paths in tracked review scope for public
    projects
- `mcp-server/src/utils/distill.ts`
- `mcp-server/src/utils/entry-surface-refresh.ts`
- `mcp-server/src/utils/runtime-review-surface.ts`
- `mcp-server/src/utils/standard-kit.ts`
- `mcp-server/src/utils/__tests__/distill.test.ts`
- `mcp-server/src/utils/__tests__/entry-surface-refresh.test.ts`
- `mcp-server/src/utils/__tests__/runtime-review-surface.test.ts`
- `.meta/templates/.project.yaml`
- `.meta/templates/quick-start.md`
- `.meta/standard-kit/README.md`
- `.meta/standard-kit/inheritance-rules.md`
- `.meta/standard-kit/manifest.yaml`
- `mcp-server/README.md`
- product `README.md` where policy/recovery semantics are described
- publication-policy and memory-layer standards that still encode universal raw
  conversation semantics
- conformance / standard-kit checks that validate public-project truth

## Test Plan

### Shared Policy / Path Contract

Cover at minimum:

1. policy resolution for `local_private`, `private_continuity`,
   `public_distilled`
2. default, custom, and invalid escape-path configurations
3. repo-root and project-root boundary validation

### Conversation Routing Utility / Derived View

Cover at minimum:

1. `public_distilled` routes raw history to `.private/conversations/`
2. `private_continuity` keeps raw history in tracked conversations path
3. `local_private` remains unchanged
4. custom configured paths are normalized correctly when policy allows
5. project-root escape attempts fail closed
6. legacy tracked transcript detection is surfaced
7. no second independent routing resolution is introduced

### Record Command

Cover at minimum:

1. `agenticos_record` writes to sidecar path for `public_distilled`
2. result message shows the actual file path written
3. result message explains whether Git recovery is full or distilled-only
4. `private_continuity` behavior remains tracked-path based
5. no-policy / invalid-policy projects fail clearly
6. legacy public tracked transcripts trigger the designed warning / note path
7. `misconfigured_public_raw_target` fails closed

### Save Alignment

Cover at minimum:

1. sidecar raw transcripts are not staged for `public_distilled`
2. existing tracked distilled surfaces are not regressed
3. save output does not claim raw sidecar history is Git-recoverable
4. tracked raw transcript diffs block `save` for `public_distilled`
5. tracked continuity set matches the published distilled recovery contract

### Guidance / Template / Conformance

Cover at minimum:

1. generated guidance no longer treats conversations as a universal tracked
   startup surface
2. entry surfaces reflect policy-derived truth
3. templates/comments do not misdescribe public raw transcript routing
4. conformance checks catch contradictory semantics
5. guardrail/review scope flags sidecar raw transcript leakage for
   `public_distilled`

### Test Matrix Dimensions

At minimum cover:

1. policy:
   - `local_private`
   - `private_continuity`
   - `public_distilled`
2. path shape:
   - default
   - custom valid override
   - invalid escape path
3. history state:
   - empty project
   - legacy tracked conversations present
   - legacy tracked conversations dirty
   - sidecar conversations already present

## Rollout Plan

### Tranche 1

- consume shared `context-policy-plan` utility
- add derived routing / legacy-status helper if needed
- lock `agent_context.conversations` semantics
- add planner tests

### Tranche 2

- wire `record.ts`
- update record messaging
- add legacy transcript classifier / warning behavior
- update record tests

### Tranche 3

- align `save.ts` tracked continuity, exclusion, and blocking behavior
- update `runtime-review-surface.ts`, switch/status, and guardrail scope checks
- update docs/templates/generated guidance/standard-kit wording
- update conformance checks and related tests

## Open Questions

These are implementation-time questions, not design blockers:

1. Should the derived helper live in a new file or be folded into the shared
   planner / continuity utility?
   - requirement: no second routing authority either way
2. Should legacy public transcript notices be elevated to conformance failure,
   WARN, or both when historical committed leakage exists but no new diff is
   present?
   - requirement: tracked raw transcript diffs still block `save`
3. Should a future issue add sanitized tracked transcript summaries?
   - current recommendation: not in `#245`

## Final Recommendation

Implement `#245` as:

1. policy-aware raw transcript routing for `public_distilled`
2. a policy-aware distilled save contract, not just record-path branching
3. legacy-compatible but non-dual-write public rollout with explicit
   warn/block states
4. a full operator-surface correction across docs, templates, generated
   guidance, standard-kit, guardrails, and conformance

Keep the sequencing clean:

1. `#244` gives private repos full tracked continuity
2. `#245` gives public repos private raw transcript isolation

Do not merge them into one implementation issue, but do require both to build
on the same shared validated policy/path contract.
