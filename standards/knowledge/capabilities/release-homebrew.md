# Release And Homebrew

## 1. Overview

Release and Homebrew distribution turn merged AgenticOS work into a local binary
that agents can actually use. The core lesson in current standards is that
package installation is not runtime activation.

Public surfaces:

- `.github/workflows/release.yml`
- `homebrew-tap/Formula/agenticos.rb`
- `agenticos-mcp --version`
- `agenticos-bootstrap --verify`
- `agenticos-config --validate`
- `agenticos_health` version freshness

User value: after a release and Homebrew upgrade, the local machine should run
the new MCP server and bootstrap logic, then verify agent activation surfaces.

## 2. Detailed Design

Release flow:

1. Merge release group to main.
2. Bump `mcp-server/package.json` and lockfile.
3. Update `CHANGELOG.md`.
4. Merge release PR.
5. Tag `vX.Y.Z`.
6. Release workflow builds, packs, and uploads `agenticos-mcp.tgz`.
7. Homebrew formula is bumped automatically if `HOMEBREW_TAP_PAT` is present;
   otherwise manual tap update is required.
8. Local machine runs `brew update && brew upgrade agenticos`.
9. Agent runtimes are restarted/reloaded and bootstrap verification runs.

Invariants:

- Homebrew installs binaries only; it does not silently mutate user agent config.
- Release artifact version and formula version must match.
- Activation Skill updates require bootstrap apply/verify and agent restart.
- Missing tap token must be visible before release is considered complete.

Failure modes:

- GitHub release exists but tap formula remains old.
- Local Homebrew cache is stale.
- Installed binary is new but agent session still holds old MCP process.
- Skill/applicator versions remain stale after package upgrade.

## 3. Implementation Mapping

| Surface | Files/Tests | Notes |
| --- | --- | --- |
| Release workflow | `.github/workflows/release.yml` | Tag-driven build/release/tap sync. |
| Formula | `homebrew-tap/Formula/agenticos.rb`, `homebrew-bootstrap-docs.test.ts` | Formula and caveats. |
| Version freshness | `mcp-server/src/utils/health.ts`, tests | Warns about installed/source mismatch. |
| Bootstrap verification | `bootstrap-cli.ts`, tests | Validates runtime activation. |
| Release process | `standards/.context/release-process.md` | Operator flow and PAT note. |

Issue cluster: 39 release/Homebrew issues. Open gaps are `#547` and `#522`.

Status: operational but credential-sensitive. `v0.4.37` was released and
installed locally, but the release workflow failed at GitHub Release creation
with REST 401, requiring manual release and tap recovery.

## Gaps

- `#522`: add release workflow early-fail guard for missing Homebrew tap PAT.
- `#547`: fix GitHub Release token validation and sync source-repo formula drift
  after manual release recovery.
