# Homebrew Distribution Standard

## Purpose

This standard defines how managed projects publish release tags as Homebrew formula updates via the shared reusable workflow in `madlouse/agenticos`. It ensures consistent, auditable, and secure distribution across all projects.

## Prerequisites

- A GitHub Personal Access Token (PAT) stored as a repository secret with write access to the target Homebrew tap.
- The target Homebrew tap repository already exists.
- A formula file (`Formula/<name>.rb`) is present in the tap, committed to its default branch.

## Standard Workflow

### Step 1: Tag a Release

On the source project, create and push a version tag:

```bash
git tag v<version>
git push origin v<version>
```

Tags must follow semver format (`v*.*.*`). Prerelease tags containing `-` (e.g. `v1.0.0-alpha`) are automatically skipped by the workflow to avoid polluting the stable formula.

### Step 2: CI Triggers the Caller Workflow

The caller workflow at `.github/workflows/homebrew-bump.yml` fires on any `v*` tag push. It calls the reusable template with the project's parameters.

### Step 3: Reusable Template Bumps the Formula

The reusable template (`homebrew-bump-template.yml`) calls `mislav/bump-homebrew-formula-action@v4`, which:

1. Fetches the current formula from the tap.
2. Updates the `url`, `sha256`, and `tag` fields.
3. Opens a PR against the tap with the updated formula.

### Step 4: Tap Maintainer Merges the PR

A human maintainer reviews and merges the PR on the Homebrew tap. Formula availability is typically within minutes of merge.

## Parameter Quick Reference

| Project | formula-name | formula-path | homebrew-tap | Secret Name |
|---|---|---|---|---|
| agent-cli-api | agent-cli-api | Formula/agent-cli-api.rb | madlouse/homebrew-agent-cli-api | HOMEBREW_TAP_PAT |
| agenticos | agenticos | Formula/agenticos.rb | madlouse/homebrew-agenticos | HOMEBREW_TAP_PAT |
| 360teams-opencli | opencli | (empty = root) | madlouse/homebrew-360teams-opencli | HOMEBREW_TAP_PAT |
| qifu-web-opencli | opencli | (empty = root) | madlouse/homebrew-qifu-web-opencli | HOMEBREW_TAP_PAT |

## Reusable Template

The reusable template lives at:

```
madlouse/agenticos/.github/workflows/homebrew-bump-template.yml
```

It is a `workflow_call` reusable workflow. It holds no secrets; the PAT lives in the caller repository (principle of least privilege).

Template inputs:

| Input | Required | Default | Description |
|---|---|---|---|
| formula-name | Yes | — | Homebrew formula name, e.g. `agenticos` |
| formula-path | No | `""` | Path inside tap, e.g. `Formula/agenticos.rb`. Empty = root level. |
| homebrew-tap | Yes | — | Full tap path, e.g. `madlouse/homebrew-agenticos` |

Template secrets:

| Secret | Required | Description |
|---|---|---|
| committer-token | Yes | GitHub PAT with write access to the homebrew-tap |

## Adding a New Project

1. Add a caller workflow file to the project's `.github/workflows/` directory.
2. Set `on.push.tags: ['v*']` to trigger on version tags.
3. Reference the reusable template with `uses: madlouse/agenticos/.github/workflows/homebrew-bump-template.yml@main`.
4. Provide the three `with` parameters and the `committer-token` secret.
5. Store the tap PAT as a repository secret in the calling repo.
6. Document the project in the parameter table above.

## FAQ

**Q: Can I use the template from a fork?**
A: Yes, but the PAT must have write access to the tap. Forks typically need their own PAT secret.

**Q: Why are prerelease tags skipped?**
A: The workflow condition `!contains(github.ref_name, '-')` prevents `v1.0.0-alpha`-style tags from creating formula updates, which would corrupt the stable release channel.

**Q: Who merges the formula PR?**
A: A human maintainer of the target Homebrew tap. The workflow only opens the PR; it does not auto-merge.
