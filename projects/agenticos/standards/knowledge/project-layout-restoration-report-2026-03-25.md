# Project Layout Restoration Report — 2026-03-25

## Summary

Issue `#104` corrects an overreaching interpretation of the earlier self-hosting and runtime-extraction work.

The intended model was:

- keep `AgenticOS` itself as the product-source project under `projects/agenticos/`
- preserve the pre-existing sibling `projects/*` content in the source checkout unless there is an explicit, verified migration plan for each project
- avoid breaking legacy operator integrations such as Claude Code hook scripts that still call top-level paths

The incorrect model that had been documented was:

- treat non-`agenticos` tracked `projects/*` entries as already extracted away from the source checkout
- treat the top-level `tools/` area as unnecessary after self-hosting migration

That documented model was too aggressive for the actual operator expectations and caused visible breakage.

## Root Cause

Three changes were allowed to compound without a final intent check:

1. the self-hosting migration moved AgenticOS implementation paths under `projects/agenticos/`
2. follow-up runtime extraction work removed several sibling `projects/*` directories from the source checkout
3. no compatibility layer was kept for hook callers that still referenced `/Users/jeking/dev/AgenticOS/tools/record-reminder.sh`

This produced two failures:

- apparent disappearance of previously visible sibling projects
- Claude Code stop-hook failures because the legacy top-level script path no longer existed

## Verified Recovery

The following tracked project directories were restored from the preserved branch `preserve/local-main-2026-03-24` into the canonical source checkout:

- `projects/2026okr`
- `projects/360teams`
- `projects/agentic-devops`
- `projects/agentic-os-development`
- `projects/ghostty-optimization`

The legacy-compatible top-level hook path was also restored:

- `tools/record-reminder.sh`

Verification performed:

- confirmed the restored directories exist in `/Users/jeking/dev/AgenticOS/projects/`
- confirmed `bash /Users/jeking/dev/AgenticOS/tools/record-reminder.sh` exits successfully
- confirmed the restored top-level script matches `projects/agenticos/tools/record-reminder.sh`

## Non-Recoverable Paths

`projects/t5t` and `projects/okr-management` were re-checked during this correction and remain non-recoverable as full projects from the available evidence:

- preserved Git history shows them as `160000` gitlinks, not normal tracked directories
- `.gitmodules` is absent
- no matching local submodule repositories were found
- no corresponding GitHub repositories were found under the expected owner

They must therefore remain outside the set of verified restored projects unless a separate canonical source is later identified.

## Corrected Boundary Rule

The corrected repository interpretation is:

- `projects/agenticos/` is the only canonical AgenticOS product-source project
- preserved sibling `projects/*` directories may continue to exist in the source checkout and should not be removed by default
- top-level `tools/` remains part of the operator-visible compatibility surface until hook consumers are migrated
- removal or extraction of sibling projects requires explicit per-project intent and verified recovery/rollback evidence

## Follow-up

Any future cleanup or migration issue touching `projects/*` or top-level operator paths should be blocked unless it answers all of the following:

1. which exact paths are in scope
2. which existing operator integrations still call those paths
3. where verified recovery copies live
4. what rollback step restores the previous visible workspace layout
