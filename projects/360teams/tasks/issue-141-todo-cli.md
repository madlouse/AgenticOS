# Issue #141 — 360Teams Todo CLI

## Issue
- ID: #141
- Title: 360Teams Todo CLI — 待办审批命令行
- Branch: `feat/issue-141-todo-cli`
- Worktree: `agent-ad8972ae`
- Status: PR ready (review passed, adversarial fixes applied)

## Scope
- Task type: feature (CLI command)
- Commands added: `todo list`, `todo view`, `todo approve`, `todo reject`, `todo forward`, `todo assign`
- Entry point: `projects/360teams/clis/360teams/todo.js` (937 lines)

## Preflight
- Preflight passed: yes
- Blocking exceptions: none

## Design Decisions

### CDP webview V8 compatibility (P1)
360Teams Electron webview V8 rejects modern JS syntax (`const`/`let`, arrow functions, template literals) inside `page.evaluate()` string arguments.
All CDP evaluate strings were rewritten to use `var` + `function` + string concatenation.
See: `knowledge/cdp-patterns.md`

### Todo type detection
Two categories detected by button labels:
- OA: "批准" / "退回" buttons
- 工单: "同意" / "驳回" buttons

`parseTodoList()` (all 3 strategies) does NOT set a `type` field — type is only determinable after clicking into the detail panel.

### Unknown type safety
`performAction()` aborts with error when `type === 'unknown'` instead of guessing button labels. This prevents wrong-item execution on unrecognized panels.

### Detail panel loading
`waitForDetailPanel()` polls for `.approval-detail`, `.todo-detail`, `.el-drawer__body`, or `[class*="detail"]` up to 5s. Replaces unreliable `sleep(2000)` pattern used in all action commands.

### Person selector
`selectPerson()` prefers exact match first; returns `{ ambiguous: true, count }` when multiple substring matches found (user must supply more of the name).

## Changed Surfaces

| File | Change |
|------|--------|
| `clis/360teams/todo.js` | New feature — 937 lines, 6 commands |
| `knowledge/cdp-patterns.md` | New — CDP webview constraint documentation |
| `tests/todo.test.js` | New — 23 tests for pure functions |
| `vitest.config.js` | Added `todo.js` to coverage include |
| `CLAUDE.md` | Upgraded template v4 → v6, added Cumulative Review Log Protocol |

## Verification
- Unit tests: 23 passed (`npx vitest run`)
- `/review` adversarial review: passed, fixes applied
- Coverage config: `todo.js` added to `vitest.config.js` include

## Residual Risk
- E2E not automated — requires live 360Teams Electron app on localhost:9234
- `parseTodoList` Strategy C (innerText fallback) is heuristic and may misparse on UI changes
- `waitForDetailPanel` timeout is 5s — slower environments may need adjustment
- Todo type can only be determined after clicking into detail, not from list view

## Ready To Submit
- Yes
