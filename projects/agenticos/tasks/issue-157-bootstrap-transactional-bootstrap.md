# Issue #157: Transactional Bootstrap CLI

## GitHub

- Issue: https://github.com/madlouse/AgenticOS/issues/157
- Title: `feat: make install/bootstrap transactional so AGENTICOS_HOME and MCP registration cannot drift across agents`

## Scope For This Slice

This slice isolates the bootstrap CLI implementation surfaces that were previously stranded in the canonical dirty worktree.

Primary targets:

- `README.md`
- `projects/agenticos/mcp-server/package.json`
- `projects/agenticos/mcp-server/src/bootstrap.ts`
- `projects/agenticos/mcp-server/src/utils/bootstrap-cli.ts`
- `projects/agenticos/mcp-server/src/utils/bootstrap-helper.ts`
- `projects/agenticos/mcp-server/src/utils/__tests__/bootstrap-matrix.test.ts`
- `projects/agenticos/mcp-server/src/utils/__tests__/homebrew-bootstrap-docs.test.ts`

## Intended Outcome

- expose a dedicated `agenticos-bootstrap` binary
- support explicit workspace selection and first-run bootstrap behavior
- inject `AGENTICOS_HOME` explicitly into supported agent bootstrap commands
- keep the implementation isolated from unrelated runtime-state cleanup work

## Notes

- The canonical checkout remains dirty for unrelated reasons tracked in issue `#169`.
- This worktree exists only to normalize the bootstrap slice into a reviewable issue branch.
