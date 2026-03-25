# Missing Project Source Audit — 2026-03-25

## Summary

Issue `#106` audits whether the previously visible `projects/t5t` and `projects/okr-management` paths can be honestly restored as complete projects from verified local evidence.

The result is asymmetric:

- `t5t` has enough verified local evidence to support a **reconstructed project snapshot**
- `okr-management` has verified **external document sources** and registry history, but not enough AgenticOS-project-local evidence to claim that its original `projects/okr-management` directory can be fully restored as a canonical project snapshot

## What Was Proved

### Registry History

Claude file-history preserves multiple snapshots of the AgenticOS registry showing that both projects were registered as active managed projects:

- `t5t` → `/Users/jeking/dev/AgenticOS/projects/t5t`
- `okr-management` → `/Users/jeking/dev/AgenticOS/projects/okr-management`

Verified examples:

- `/Users/jeking/.claude/file-history/e51eb37f-79b6-4005-81d0-403f65cda5f5/6e2f7608769cdf3c@v1`
- `/Users/jeking/.claude/file-history/d561ad12-0ef5-4e5d-9017-d2240a3afc0c/6e2f7608769cdf3c@v2`

### Git History

Git history in the AgenticOS source repo did not preserve normal tracked directories for these paths.

Instead:

- `projects/t5t`
- `projects/okr-management`

appeared as orphaned `160000` gitlinks and were later removed by commit `3b1b913e282f6cbbac2e6ed607bcf2316e6bd144`.

This means the source repo itself is not the canonical content source for either project.

## `t5t` Audit Result

### Verified Recoverable Sources

The following local sources were verified:

1. **Skill implementation surface**
   - `/Users/jeking/.claude/skills/t5t/SKILL.md`

2. **Execution CLI**
   - `/Users/jeking/.opencli/clis/360teams/t5t.js`

3. **Business content / example material**
   - `/Users/jeking/dev/code/T5T/项目进展总结(1).md`
   - `/Users/jeking/work/02.目标绩效/00.OKR管理/2025/T5T.md`

4. **Recovered project semantics from Claude file-history**
   - T5T skill and workflow snapshots:
     - `/Users/jeking/.claude/file-history/85a40588-78d8-406d-b899-234d2a159f68/def40303913a9073@v6`
     - `/Users/jeking/.claude/file-history/5d63a2f8-3098-4a3d-b395-43757bfb36c2/616aab025ad5a4c9@v3`
   - Recovered project-level `CLAUDE.md` snapshot:
     - `/Users/jeking/.claude/file-history/5d63a2f8-3098-4a3d-b395-43757bfb36c2/dba1237008031423@v8`
   - Recovered knowledge-file bodies:
     - role/OKR: `/Users/jeking/.claude/file-history/85a40588-78d8-406d-b899-234d2a159f68/fcd7503e45b125b5@v2`
     - review rules: `/Users/jeking/.claude/file-history/85a40588-78d8-406d-b899-234d2a159f68/1c5db2c7038d7da9@v3`
     - writing rules: `/Users/jeking/.claude/file-history/5d63a2f8-3098-4a3d-b395-43757bfb36c2/e057d20a2441b2df@v3`
     - evolution log: `/Users/jeking/.claude/file-history/ca4b566c-c68c-4e4d-aca2-105909af9f2d/a75c896f30c0ff45@v3`
   - Published-result evidence:
     - `/Users/jeking/.claude/file-history/ca4b566c-c68c-4e4d-aca2-105909af9f2d/c596b6fbcc34859c@v2`
     - `/Users/jeking/.claude/file-history/ca4b566c-c68c-4e4d-aca2-105909af9f2d/3b12e33a9142053c@v2`

### Conclusion for `t5t`

`t5t` cannot be restored as an “original tracked Git directory” from the AgenticOS repo itself, because that content was never preserved there as a normal directory.

However, there is enough verified local evidence to reconstruct a **faithful recovered project snapshot** containing:

- project metadata
- project CLAUDE instructions
- T5 workflow and rules
- CLI integration references
- at least one verified published-result trail

So `t5t` is **recoverable by reconstruction**, not by direct Git checkout.

## `okr-management` Audit Result

### Verified Sources

1. **Registry evidence**
   - same registry snapshots above prove `okr-management` existed as a managed project path

2. **External document corpus**
   - `/Users/jeking/work/02.目标绩效/00.OKR管理/`
   - this directory contains multi-year OKR material, including:
     - `2024/`
     - `2025/`
     - `2026/`
   - representative files:
     - `/Users/jeking/work/02.目标绩效/00.OKR管理/2026/CLAUDE.md`
     - `/Users/jeking/work/02.目标绩效/00.OKR管理/2026/2026年度OKR.md`
     - `/Users/jeking/work/02.目标绩效/00.OKR管理/2026/2026Q1-OKR.md`

3. **Related OKR skill evidence**
   - `/Users/jeking/.claude/file-history/b566355d-87e2-4a29-bfb8-e69124698d29/ddc514090cee3d37@v4`
   - `/Users/jeking/.claude/file-history/97f1a2a5-116f-4117-862d-be0172e0283b/ddc514090cee3d37@v3`

### What Is Missing

No verified local evidence was found for a full original AgenticOS-managed `projects/okr-management` directory containing:

- `.project.yaml`
- `.context/`
- a dedicated project-local `knowledge/` tree
- project-local tasks / artifacts structure

### Conclusion for `okr-management`

`okr-management` is **not yet recoverable as a complete canonical AgenticOS project snapshot**.

What can be honestly claimed today is narrower:

- it existed in registry history as a managed project path
- its content appears to have lived primarily in the external working-doc directory under `/Users/jeking/work/02.目标绩效/00.OKR管理/`
- there is enough evidence to restore it later as an **external-source wrapper project** or an **evidence-backed archive**
- there is not enough evidence yet to claim we can reproduce the original `projects/okr-management` directory exactly

## Recommended Next Action

### For `t5t`

Open a dedicated restoration issue to reconstruct `projects/t5t` from the verified local evidence above.

The reconstruction should be explicitly labeled as:

- `recovered from verified local sources`

not as:

- `original Git-tracked directory restored verbatim`

### For `okr-management`

Open a separate restoration issue with one of two honest target models:

1. **external-source wrapper project**
   - keeps project metadata in AgenticOS
   - points canonical content to `/Users/jeking/work/02.目标绩效/00.OKR管理/`

2. **evidence-backed archive project**
   - imports selected verified OKR materials into a recovered project shell
   - clearly marks the result as reconstructed from external docs, not original project state

## Decision

Do not claim `t5t` and `okr-management` are equally recoverable.

The corrected recovery decision is:

- `t5t` → reconstructable now
- `okr-management` → only partially attributable now; needs a separate explicit recovery model
