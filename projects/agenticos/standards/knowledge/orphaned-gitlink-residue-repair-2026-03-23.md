# Orphaned Gitlink Residue Repair - 2026-03-23

## Summary

Issue `#56` repairs the two remaining broken `projects/*` entries after the runtime extraction waves:

- `projects/okr-management`
- `projects/t5t`

These are not real runtime projects anymore.

They were verified as orphaned gitlink residues:
- `git ls-tree HEAD` shows mode `160000` for both paths
- the current checkout contains empty directories for both paths
- `git submodule status --recursive` fails because there is no valid `.gitmodules` mapping
- no canonical local runtime root with actual content was found
- direct `gh repo view` checks did not find standalone repos `madlouse/okr-management` or `madlouse/t5t`

## Resolution

Because there is no verified canonical content source, these paths should not be preserved as runtime projects.

This repair does three things:
1. removes the orphaned gitlink entries from the source repository
2. removes the broken live-workspace registry references that still pointed to the source checkout
3. updates the machine-readable classification and root guidance so future agents do not misclassify these residues as real projects

## Why Removal Is Correct

Keeping the residues would leave the repository in a structurally misleading state:
- `projects/` would still appear to contain more runtime projects than really exist
- submodule inspection would remain broken
- future extraction logic could keep treating empty placeholders as if they were recoverable project roots

Removal is safer than inventing project content.

## Resulting Boundary

After this repair:
- real extracted runtime projects are:
  - `2026okr`
  - `360teams`
  - `agentic-devops`
  - `ghostty-optimization`
- `projects/agenticos` remains the only canonical product-source project
- `projects/test-project` remains the only explicit fixture/example candidate still tracked under `projects/`

## Follow-Up Relationship

This issue unblocks closure of the runtime extraction program tracked by `#53` because the final remaining items are now resolved as repository-integrity cleanup rather than deferred extraction candidates.
