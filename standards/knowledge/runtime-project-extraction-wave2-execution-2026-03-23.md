# Runtime Project Extraction Wave 2 Execution - 2026-03-23

## Summary

Issue `#53` executed the second extraction wave for the split-brain runtime projects:

- `projects/agentic-devops`
- `projects/ghostty-optimization`

This wave resolved the "source shadow versus external project root" cases by creating canonical runtime roots under:

- `/Users/jeking/AgenticOS/projects/agentic-devops`
- `/Users/jeking/AgenticOS/projects/ghostty-optimization`

## Handling Model

### `agentic-devops`

Observed state before extraction:
- the source repo copy contained AgenticOS-managed metadata only
- an external directory at `/Users/jeking/agentic-devops` contained the apparent real project content

Wave-2 handling:
1. copy the external project tree into `AGENTICOS_HOME/projects/agentic-devops`
2. overlay the source shadow with `--ignore-existing`
3. preserve both:
   - the project content
   - the AgenticOS metadata/context files

### `ghostty-optimization`

Observed state before extraction:
- registry previously pointed to `/Users/jeking/dev/ghostty-optimization`
- that external path was a standalone Git repository and the more complete canonical project root
- the source repo copy contained older shadow-only context/task artifacts not present in the external repo

Wave-2 handling:
1. copy the external standalone repository into `AGENTICOS_HOME/projects/ghostty-optimization`
2. overlay the source shadow with `--ignore-existing`
3. preserve the external canonical files for:
   - `.project.yaml`
   - `CLAUDE.md`
   - `.context/quick-start.md`
   - `.context/state.yaml`
4. import source-only shadow artifacts such as:
   - `.context/changelog.md`
   - `.context/conversations/2026-03-16.md`
   - `.context/index.yaml`
   - `.context/memory.jsonl`
   - `artifacts/benchmarks/`
   - `artifacts/code/`
   - `knowledge/user-insights.md`
   - `tasks/in-progress.yaml`

## Verification

For `agentic-devops`:
- destination path was absent before extraction
- final workspace root contains both project content and AgenticOS metadata
- destination `.project.yaml` and `.context/state.yaml` parse successfully

For `ghostty-optimization`:
- destination path was absent before extraction
- destination `.project.yaml` and `.context/state.yaml` parse successfully
- destination remains a valid Git worktree
- `git status --short --branch` in the workspace copy stayed clean after overlay
- source-only shadow artifacts are present in the workspace copy
- conflicting canonical files were not overwritten by the source shadow

Registry verification:
- `agentic-devops` now points to `/Users/jeking/AgenticOS/projects/agentic-devops`
- `ghostty-optimization` now points to `/Users/jeking/AgenticOS/projects/ghostty-optimization`

## Source-Repo Change Scope

After the workspace copies were verified, this wave removes only:
- `projects/agentic-devops`
- `projects/ghostty-optimization`

from the product source repository.

## Remaining Deferred Work

Issue `#53` is still not complete after wave 2.

Remaining unresolved runtime residues:
- `projects/okr-management`
- `projects/t5t`

Reason:
- both are still gitlink residues without valid `.gitmodules` mappings in the current source checkout

They should be handled in a later wave rather than mixed into this split-brain reconciliation change.
