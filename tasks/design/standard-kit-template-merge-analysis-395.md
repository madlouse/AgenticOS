# Design: Copied-Template Semantic Diff & Selective Merge for Standard-Kit Upgrade

## Issue

[#395](https://github.com/madlouse/AgenticOS/issues/395) — `agenticos_standard_kit_upgrade_check` reports `diverged_from_canonical` but provides no mechanism to understand **what** diverged, **why**, or **whether to merge**.

## Background & Context

### Two-Layer Architecture (from `manifest.yaml`)

| Layer | Files | Upgrade Strategy | Implementation |
|-------|-------|-----------------|----------------|
| **Generated files** | `AGENTS.md`, `CLAUDE.md` | Version-based auto-upgrade | `distill.ts` with module markers (improved by #374) |
| **Copied templates** | `.project.yaml`, `.context/quick-start.md`, etc. | Opt-in with comparison | **Missing** — this issue |

### Manifest Declaration

```yaml
copied_template_rule: >
  Copied templates are project-owned after adoption.
  Upgrades should be opt-in and compare against canonical sources.
```

The "compare" step is implemented as a raw byte comparison (`===`), which only tells you **that** files differ, not **what** differs or **how to decide**.

### Current Behavior

```
checkStandardKitUpgrade():
  For each copied_template:
    if destinationContent === canonicalContent:
      status = 'matches_canonical'
    else:
      status = 'diverged_from_canonical'   # ← binary, no further info

adoptStandardKit():
  For each copied_template:
    if exists(destination):
      skippedExistingTemplates.push(path)   # ← always skip, never merge
```

## Problem Statement

When `upgrade_check` returns `diverged_from_canonical` for a copied template, the operator has no actionable information:

1. **No diff output** — Can't see what changed between canonical and local
2. **No change classification** — Can't distinguish:
   - `project_customization`: Project-specific field that should be preserved
   - `standard_improvement`: Canonical evolved and should be merged
   - `template_marker_only`: Trivial diff (just version comment)
3. **No merge mechanism** — `adopt` always skips existing files

This makes standard-kit upgrades painful: operators either blindly adopt (losing project customizations) or never upgrade (drifting from canonical).

## Real-World Evidence from AgenticOS Self-Host

9 copied templates currently report `diverged_from_canonical`:

| File | Divergence Type | Classification | Action |
|------|---------------|----------------|--------|
| `.project.yaml` | `agent_context` paths, new sections | **Mixed** | Selective merge |
| `.context/quick-start.md` | Rich project facts, structural changes | **Mixed** | Selective merge |
| `.context/state.yaml` | Full operational state data | **All project-specific** | Keep as-is |
| `tasks/templates/agent-preflight-checklist.yaml` | Only template comment | **Trivial** | Safe to merge |
| `tasks/templates/issue-design-brief.md` | Only template comment | **Trivial** | Safe to merge |
| `tasks/templates/non-code-evaluation-rubric.yaml` | Template comment + version 0.1→0.2 | **Minor** | Review 0.2 changes |
| `tasks/templates/sub-agent-handoff.md` | Only template comment | **Trivial** | Safe to merge |
| `tasks/templates/global-review-log.md` | Only template comment | **Trivial** | Safe to merge |
| `tasks/templates/submission-evidence.md` | Only template comment | **Trivial** | Safe to merge |

### Key Insight

Only 2 of 9 files need genuine selective merge analysis. 6 of 9 are trivial (template marker only). 1 of 9 should be kept as-is. This means **a good heuristic classifier can handle ~78% of cases automatically**.

## Design

### 1. Extend `checkStandardKitUpgrade` with `compare` Mode

Add a `compare: true` parameter that enriches the result for each diverged file:

```typescript
interface UpgradeCheckTemplateStatus {
  path: string;
  status: 'missing' | 'matches_canonical' | 'diverged_from_canonical';
  canonical_source: string;
  // New fields when compare=true:
  diff_lines?: string[];           // Unified diff lines
  change_classification?: ChangeClassification;
  merge_recommendation?: MergeRecommendation;
}

type ChangeClassification = 'template_marker_only' | 'minor_version_bump' | 'project_customization' | 'standard_improvement' | 'mixed' | 'unknown';
type MergeRecommendation = 'safe_to_merge' | 'review_required' | 'keep_as_is';
```

### 2. Change Classification Heuristics

#### For YAML Files (`.project.yaml`, `state.yaml`, `*.yaml` templates)

```typescript
function classifyYamlChanges(canonical: any, local: any): ClassificationResult {
  const result: ClassificationResult = {
    classification: 'unknown',
    merge_recommendation: 'review_required',
    sections: []
  };

  // Rule 1: Template marker comment only
  if (onlyTemplateMarkerChanged(canonical, local)) {
    return { classification: 'template_marker_only', merge_recommendation: 'safe_to_merge' };
  }

  // Rule 2: Version bump (e.g., 0.1 → 0.2 in rubric)
  if (isOnlyVersionBump(canonical, local)) {
    return { classification: 'minor_version_bump', merge_recommendation: 'review_required' };
  }

  // Rule 3: All changes are project-specific fields
  if (allChangesAreProjectSpecific(canonical, local)) {
    return { classification: 'project_customization', merge_recommendation: 'keep_as_is' };
  }

  // Rule 4: All changes are standard improvements
  if (allChangesAreStandardImprovements(canonical, local)) {
    return { classification: 'standard_improvement', merge_recommendation: 'safe_to_merge' };
  }

  // Rule 5: Mixed — some project-specific, some standard improvements
  return { classification: 'mixed', merge_recommendation: 'review_required' };
}
```

**Project-specific field detection for `.project.yaml`:**
- `meta.name`, `meta.id`, `meta.description`, `meta.created`
- `source_control.*` (github_repo, branch_strategy, etc.)
- `status.phase`, `status.last_updated`, `status.next_action`
- `execution.*`
- `archive_import_policy.*` (if present in local)

**Standard improvement detection for `.project.yaml`:**
- `agent_context.*` path changes (e.g., `.context/*` → `standards/.context/*`)
- New sections not in local (e.g., `tech.*`, new `archive_import_policy` fields)
- Comments added to previously uncommented fields

**Project-specific field detection for `state.yaml`:**
- `working_memory.facts[]`, `working_memory.decisions[]`, `working_memory.pending[]`
- `session.*` (except version fields)
- `current_task.*`
- `guardrail_evidence.*`
- `loaded_context[]` (project-specific context history)

**Standard improvement detection for `state.yaml`:**
- New top-level contract fields (`artifacts_role` added to `memory_contract`)
- Schema structural improvements

#### For Markdown Files (`quick-start.md`, `*.md` templates)

```typescript
function classifyMarkdownChanges(canonicalLines: string[], localLines: string[]): ClassificationResult {
  // Rule 1: Template marker comment only
  if (onlyTemplateMarkerChanged(canonicalLines, localLines)) {
    return { classification: 'template_marker_only', merge_recommendation: 'safe_to_merge' };
  }

  // Rule 2: Section-level diff analysis
  //   - "Project Snapshot" vs "Project Overview" + "Current Status" → structural project customization
  //   - "Key Facts" with project-specific content → project customization
  //   - "Recommended Entry Documents" → standard improvement (new canonical section)
  //   - "What Does Not Belong Here" removed → standard improvement (canonical streamlined)

  // Use heading structure as section boundaries
  const canonicalSections = parseMarkdownSections(canonicalLines);
  const localSections = parseMarkdownSections(localLines);

  // Classify each section as project_customization or standard_improvement
  // If all sections are one type, that's the classification
  // If mixed, return 'mixed'
}
```

### 3. Merge Execution Strategy

When `adoptStandardKit` is called with `merge: true` for diverged templates:

```typescript
async function mergeCopiedTemplate(
  localPath: string,
  canonicalPath: string,
  classification: ClassificationResult
): Promise<MergeResult> {
  if (classification.merge_recommendation === 'keep_as_is') {
    return { action: 'skipped', reason: 'project_specific_content' };
  }

  if (classification.merge_recommendation === 'safe_to_merge') {
    // For trivial/template-marker-only changes: add template marker, preserve everything else
    const merged = applyTemplateMarkerOnly(localPath, canonicalPath);
    return { action: 'merged', merged_content: merged };
  }

  if (classification.merge_recommendation === 'review_required') {
    // For mixed changes: need human decision
    // Return detailed diff for human to review
    return {
      action: 'requires_review',
      diff: computeDetailedDiff(localPath, canonicalPath),
      classification,
      options: ['keep_local', 'accept_canonical', 'manual_merge']
    };
  }
}
```

### 4. Manifest Extension

Add classification hints to `manifest.yaml` so operators can declare which fields are project-specific:

```yaml
copied_templates:
  entries:
    - path: .project.yaml
      canonical_source: projects/agenticos/.meta/templates/.project.yaml
      inheritance: copied_template
      customizable: yes
      project_specific_fields:   # ← new
        - meta.name
        - meta.id
        - meta.description
        - meta.created
        - source_control.github_repo
        - source_control.branch_strategy
        - status.phase
        - status.last_updated
        - status.next_action
        - execution.source_repo_roots
    - path: .context/quick-start.md
      canonical_source: projects/agenticos/.meta/templates/quick-start.md
      inheritance: copied_template
      customizable: yes
      project_specific_sections:   # ← new
        - "# Project Overview"
        - "# Current Status"
        - "## Key Facts"
```

### 5. Proposed API Changes

#### New `compare` parameter for `checkStandardKitUpgrade`

```typescript
// Before
checkStandardKitUpgrade({ project_path }) → UpgradeCheckResult

// After
checkStandardKitUpgrade({ project_path, compare: true }) → UpgradeCheckResultWithDiff
```

#### New `merge` parameter for `adoptStandardKit`

```typescript
// Before
adoptStandardKit({ project_path }) → AdoptResult

// After
adoptStandardKit({ project_path, merge: 'auto' | 'interactive' | 'skip' })
//   'auto': Apply safe_to_merge recommendations automatically, skip review_required
//   'interactive': Stop at review_required and ask
//   'skip' (default): Preserve current behavior — skip all diverged templates
```

#### New standalone `compareStandardKit` command

```typescript
compareStandardKit({ project_path, file?: string }) → CompareResult
// Provides detailed diff + classification for one file or all diverged files
// Does not modify anything — read-only analysis
```

### 6. UX Flow

**Operator Experience:**

```
$ agenticos_standard_kit_upgrade_check --project agenticos --compare

copied_templates:
  - path: .project.yaml
    status: diverged_from_canonical
    diff_lines: [...]
    classification: mixed
    merge_recommendation: review_required
    summary: |
      Project-specific (keep): meta.*, source_control.github_repo, status.*
      Standard improvements: agent_context paths (standards/.context/*), new tech.* section

  - path: tasks/templates/agent-preflight-checklist.yaml
    status: diverged_from_canonical
    diff_lines: ["-# <!-- agenticos-template: v1 -->", "+version: 0.2"]
    classification: template_marker_only
    merge_recommendation: safe_to_merge
    summary: Only template version marker differs — safe to merge
```

```
$ agenticos_standard_kit_adopt --project agenticos --merge auto

Processing .project.yaml: skipped (mixed changes — use --merge interactive to review)
Processing tasks/templates/agent-preflight-checklist.yaml: merged (template marker)
...
```

```
$ agenticos_standard_kit_adopt --project agenticos --merge interactive

Review: .project.yaml
  Project-specific (will be preserved):
    - meta.name = "AgenticOS"
    - status.next_action = "Keep root compatibility surfaces..."
  Standard improvements (will be merged):
    - agent_context.quick_start: ".context/quick-start.md" → "standards/.context/quick-start.md"
    - agent_context.current_state: ".context/state.yaml" → "standards/.context/state.yaml"
    - New section: archive_import_policy

  [Accept improvements] [Keep as-is] [Manual merge]
```

## Implementation Plan

### Phase 1: Compare-Only (Non-Breaking)

1. Add `compareStandardKit` as a new read-only command
2. Implement classification heuristics for YAML and Markdown
3. No changes to existing `checkStandardKitUpgrade` or `adoptStandardKit` behavior

### Phase 2: Safe Merge

1. Add `merge: 'auto' | 'skip'` parameter to `adoptStandardKit`
2. Implement `safe_to_merge` classification for trivial cases
3. Default `merge: 'skip'` to preserve current behavior

### Phase 3: Interactive Merge

1. Add `merge: 'interactive'` mode
2. Implement detailed diff display for `review_required` cases
3. Provide merge options UI

### Phase 4: Manifest-Driven Classification

1. Add `project_specific_fields` and `project_specific_sections` to manifest entries
2. Use manifest hints for accurate classification
3. Validate manifest hints don't conflict with standard-kit required behaviors

## Risk Analysis

### Misclassification Risk

**Scenario:** Classifier marks a project-specific field as a standard improvement and merges it, destroying project content.

**Mitigation:**
- `safe_to_merge` only used for `template_marker_only` and unambiguous `standard_improvement` cases
- `review_required` is the conservative default for `mixed` classification
- `keep_as_is` is the conservative default when uncertain

**Severity:** High for `mixed` files that get incorrectly auto-merged
**Probability:** Medium — heuristics can be wrong for edge cases

### Breaking Change Risk

**Scenario:** Adding `merge` parameter changes default behavior of `adoptStandardKit`.

**Mitigation:**
- Default `merge: 'skip'` preserves exact current behavior
- No existing calls to `adoptStandardKit` should break

## Open Questions

1. **For `state.yaml`**: The local file has rich `working_memory`, `guardrail_evidence`, and `current_task` data. Should this data be preserved even when the canonical `memory_contract` structure evolves (e.g., new optional fields added)? — **Yes, preserve all project-specific sections.**

2. **For `non-code-evaluation-rubric.yaml` v0.1→v0.2**: Need to review what changed in v0.2 before recommending merge. Current classification is `review_required`.

3. **Manifest hints vs. heuristics**: Should we rely on manifest-declared `project_specific_fields` or heuristics? — **Both: manifest hints as authoritative, heuristics as fallback for backward compatibility.**

4. **Markdown section classification**: How to handle markdown sections that are semantically equivalent but worded differently (e.g., "Project Snapshot" vs "Project Overview")? — **Heuristic: if section covers same conceptual area, mark as `project_customization`.**

## Relationship with #374 (Generated Files)

### Issue #374 Recap

Issue #374 addressed **generated files** (AGENTS.md, CLAUDE.md) where the template is applied wholesale, destroying project-specific sections like Command Contract and Secret Contract.

**Solution implemented:** Section markers (`<!-- agenticos-section: name -->`) that distinguish:
- **Standard protocol sections** — replaced on upgrade
- **Project-specific sections** — preserved on upgrade

### #395 vs #374: Different Layers, Same Principle

| Aspect | #374 (Generated Files) | #395 (Copied Templates) |
|--------|----------------------|------------------------|
| **Files** | AGENTS.md, CLAUDE.md | .project.yaml, quick-start.md, etc. |
| **Customization model** | Structured (explicit section markers) | Organic (free-form edits) |
| **Upgrade mechanism** | Marker-based section replacement | Semantic diff + classification |
| **Risk** | Marker misplacement | Heuristic misclassification |
| **Implementation status** | Done (distill.ts) | Pending (this issue) |

**Unified principle:** Standard protocol content should be updated; project-specific content should be preserved. The difference is *how* we identify and handle each type.

### Why Two Different Mechanisms?

**Generated files** use explicit section markers because:
1. The template already defines clear section boundaries
2. Distill generates the file fresh each time, so markers are authoritative
3. Project adds custom sections in designated "project customization" slots

**Copied templates** need semantic analysis because:
1. Project edits the template freely after adoption
2. No explicit markers exist to distinguish project vs. standard content
3. Changes are interspersed throughout the file (not in slots)

These are **fundamentally different customization models** requiring different upgrade mechanisms. However, they share the same manifest declaration:

```yaml
copied_template_rule: >
  Copied templates are project-owned after adoption.
  Upgrades should be opt-in and compare against canonical sources.
generated_file_rule: >
  Generated files may be upgraded in place by distill when the template marker version changes.
```

## Systematic Upgrade Framework

### Three Dimensions of "Upgrade"

When we say "upgrade," we need to be clear about three orthogonal dimensions:

#### 1. Content Dimension — *What* is being upgraded?

| Content Type | Examples | Upgrade Mechanism |
|-------------|----------|------------------|
| **Standard protocol** | Guardrail Protocol, Recording Protocol | Auto-upgrade (generated) or safe merge (copied) |
| **Required behaviors** | operator_intent_resolution, session_start_alignment | Behavioral conformance check |
| **Structural schema** | memory_contract version, agent_context paths | Safe merge with field preservation |
| **Project data** | meta.name, working_memory.facts, status.next_action | Keep as-is |
| **Operational state** | current_task, session.id, guardrail_evidence | Keep as-is |

#### 2. Standards Dimension — *What governance* applies?

From `manifest.yaml`, there are two kinds of standards:

**Canonical standards** (imposed by AgenticOS):
- Required behaviors listed in `manifest.adoption.required_behavior`
- Generated file structure (version markers, section organization)
- Template schema (field names, required sections)

**Project-specific standards** (declared by downstream project):
- Custom project conventions (Command Contract, Secret Contract)
- Project-specific workflow adaptations
- Local documentation conventions

#### 3. Compatibility Dimension — *How* to maintain compatibility?

The compatibility model has three strategies:

| Strategy | When to Use | Mechanism |
|----------|-------------|-----------|
| **Preserve** | Project-specific content, operational state | Keep local version untouched |
| **Merge** | Mixed files (some standard, some project) | Selective field/section merge |
| **Replace** | Standard protocol sections, template markers | Accept canonical version |

### Compatibility Rules Matrix

For each file type, here are the compatibility rules:

```
Copied Templates:
┌─────────────────────────────────────────────────────────────────────┐
│ .project.yaml                                                       │
│   meta.*                     → Preserve (project identity)           │
│   source_control.github_repo → Preserve (project identity)           │
│   source_control.topology     → Preserve (structural)                │
│   status.*                    → Preserve (operational state)          │
│   agent_context.* paths       → Merge (canonical improvement)        │
│   memory_contract.version     → Merge (schema evolution)             │
│   archive_import_policy       → Merge (new canonical section)        │
├─────────────────────────────────────────────────────────────────────┤
│ .context/quick-start.md                                             │
│   Project Overview           → Preserve (project identity)           │
│   Current Status             → Preserve (operational state)          │
│   Key Facts                  → Preserve (project-specific facts)    │
│   Latest Landed Reports      → Preserve (project-specific)          │
│   Recommended Entry Docs     → Merge (canonical improvement)        │
│   Canonical Layers           → Preserve (semantic equivalence)      │
│   What Does Not Belong Here  → Accept canonical removal             │
├─────────────────────────────────────────────────────────────────────┤
│ .context/state.yaml                                                 │
│   ALL content                 → Preserve (operational state)          │
│   (except template marker)    → Merge (trivial)                      │
├─────────────────────────────────────────────────────────────────────┤
│ tasks/templates/*.yaml                                              │
│   version                     → Review (check changelog)              │
│   template marker             → Merge (trivial)                       │
│   purpose/name                → Preserve (project-specific use)     │
├─────────────────────────────────────────────────────────────────────┤
│ tasks/templates/*.md                                                 │
│   template marker             → Merge (trivial)                       │
│   Section structure          → Merge (canonical improvement)         │
│   Project-specific content    → Preserve (project conventions)       │
└─────────────────────────────────────────────────────────────────────┘

Generated Files (AGENTS.md, CLAUDE.md):
┌─────────────────────────────────────────────────────────────────────┐
│ Standard Protocol Sections                                            │
│   (marked with <!-- agenticos-section: guardrail-protocol -->)      │
│   → Replace with canonical version on upgrade                         │
├─────────────────────────────────────────────────────────────────────┤
│ Project-Specific Sections                                            │
│   (marked with <!-- agenticos-section: command-contract -->)         │
│   → Preserve local version, do not modify                            │
└─────────────────────────────────────────────────────────────────────┘
```

## References

- Issue #374: Generated files module-level merge (section markers, implemented in distill.ts)
- Issue #395: Copied templates semantic diff + selective merge (this design)
- `manifest.yaml` `copied_template_rule` and `generated_file_rule`
- `adoption-checklist.md` "copied templates are treated as project-owned after adoption"
- Current `checkStandardKitUpgrade` implementation: `mcp-server/src/utils/standard-kit.ts:393-463`
- Current `adoptStandardKit` implementation: `mcp-server/src/utils/standard-kit.ts:326-391`
