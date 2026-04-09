# AgenticOS Issue Triage Plan - 2026-04-08

## Purpose

Provide one reviewable backlog-triage plan before making live GitHub issue
updates.

This plan reflects the current local state observed on 2026-04-08:

- root-git exit audit passes
- product-root shell audit passes
- runtime recovery audit still blocks on installed-runtime release parity

## Recommended issue handling

### Close-review

- `#181`
- `#189`
- `#191`
- `#214`
- `#218`
- `#220`

### Superseded / close

- `#169`
- `#187`
- `#222`
- `#224`

### Rewrite / merge

- merge `#145` + `#146` into `Bootstrap and session-start guardrail hardening`
- rewrite `#164` into `Canonicalize issue-intake boundary via agenticos_issue_bootstrap`
- merge `#149` + `#151` into `Record surface hardening`
- rewrite `#147` into `Decide Agent-CLI-API support tier before adapter-matrix inclusion`
- merge `#175` + `#177` + `#178` + `#193` + `#197` + `#198` + `#211` into `Workspace registry and topology truth repair`

### Keep active

- `#215`

### Defer / backlog reset

- `#154`
- `#161`
- `#173`
- `#174`

## New target issue set

1. `Bootstrap and session-start guardrail hardening`
2. `Canonicalize issue-intake boundary via agenticos_issue_bootstrap`
3. `Record surface hardening`
4. `Workspace registry and topology truth repair`
5. `Runtime release parity for installed AgenticOS`
6. `Decide Agent-CLI-API support tier before adapter-matrix inclusion`
7. `Agent-Friendly standards backlog reset`

## Script

Use:

```bash
cd /Users/jeking/dev/AgenticOS/projects/agenticos
bash tasks/triage-issue-backlog-2026-04-08.sh
```

Default behavior is dry-run only.

To actually post comments:

```bash
DRY_RUN=0 bash tasks/triage-issue-backlog-2026-04-08.sh
```
