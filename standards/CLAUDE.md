# CLAUDE.md — AgenticOS Standards

## Canonical Location Note

This directory is the only canonical location for ongoing AgenticOS standards work.

- live standards path: `projects/agenticos/standards/`
- retired standalone snapshot: `archive/standalone-agentic-os-development-2026-03-23/`

For current live status, prefer `.context/quick-start.md`, `.context/state.yaml`, and current `knowledge/` documents in this directory.

## Session Start Protocol

When you enter this standards area:

1. Read `.project.yaml`
2. Read `.context/quick-start.md`
3. Read `.context/state.yaml`
4. Read only the specific `knowledge/` documents needed for the current issue

Do not treat archived standalone records as the live source of truth.

## Execution Rules

1. Standards work is part of the main AgenticOS product repository and must follow the same issue-first, branch, worktree, PR flow.
2. Durable standards decisions belong in `knowledge/`, not only in chat.
3. Keep active guidance focused on the main standards area; historical documents may mention older paths, but live entry files must not.
4. Prefer reusable templates and kit assets under:
   - `projects/agenticos/.meta/templates/`
   - `projects/agenticos/.meta/standard-kit/`
5. Treat the archive as read-only provenance.

## Navigation

| Path | Purpose |
|------|---------|
| `.project.yaml` | Standards area identity and entry points |
| `.context/quick-start.md` | Human-readable current status |
| `.context/state.yaml` | Structured resumable state |
| `knowledge/` | Canonical standards reasoning and execution records |
| `archive/` | Retired standalone standards snapshot |
| `changelog.md` | Historical change log |
