# Issue #189: Codify Topology Decision Rubric and Upgrade Path

## Summary

`AgenticOS` already requires explicit topology selection, but it also needs a policy layer describing:

- when to choose `local_directory_only`
- when to choose `github_versioned`
- when to stop and confirm instead of guessing
- how a local project upgrades into GitHub Flow later

## Scope

- add a canonical rubric document
- wire that guidance into top-level README and MCP README
- make the template comments reflect the intended decision boundary

## Non-Goals

- do not add automatic topology inference
- do not force all local projects into GitHub Flow
