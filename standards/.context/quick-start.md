# AgenticOS - Quick Start

## Project Overview

Self-hosting AgenticOS product project. Canonical operational context lives under standards/.context while the root .context files remain compatibility shims.

## Current Status

- **Status**: active
- **Last Action**: Issue #302 merged — Created issue #302 to track release/install parity after confirming that main already contains post-0.4.3 continuity and transcript fixes while shipped/runtime distribution remains behind.
- **Current Focus**: Issue #302 is now the active backlog item: ship the next release so installed/runtime AgenticOS catches up with post-0.4.3 continuity and transcript behavior.
- **Resume Here**: Run issue-bootstrap and release-prep implementation flow for #302 in an isolated worktree.
- **Refreshed At**: 2026-04-19T03:56:50.359Z

## Key Facts
- GitHub issue #302 was created on 2026-04-19 for the post-0.4.3 runtime release parity gap.
- Source main already contains merged PR #270 and PR #278, but releases still stop at v0.4.3 and the Homebrew formula still points to v0.4.2.
- Targeted continuity/transcript verification passed locally on 2026-04-18 in the source tree.

## Latest Landed Reports

- tasks/issue-302-post-043-runtime-release-parity.md
- tasks/issue-266-homebrew-runtime-session-local-release.md
- tasks/issue-266-pr-draft.md

## Recommended Entry Documents

1. tasks/issue-302-post-043-runtime-release-parity.md
2. CHANGELOG.md
3. homebrew-tap/Formula/agenticos.rb

## Canonical Layers
- Operational state: `standards/.context/state.yaml`
- Session history: `standards/.context/conversations/`
- Durable knowledge: `knowledge/`
- Execution plans: `tasks/`
- Deliverables: `artifacts/`
