# AGENTICOS_HOME Lifecycle Contract

> Canonical policy for defining, confirming, and preserving the AgenticOS workspace root across bootstrap, install, upgrade, and restart.

**Version:** 1.0
**Status:** Active
**Issue:** #330

---

## Core Principle

Once an `AGENTICOS_HOME` is confirmed for a machine, it is the **canonical runtime home** until explicitly migrated by the operator.

Install and upgrade surfaces must **preserve** the confirmed value — they must not silently redefine the runtime home.

---

## Resolution Order

`getCanonicalAgenticosHome()` implements the resolution hierarchy:

1. **AGENTICOS_HOME env var** — highest priority; operator has explicitly confirmed this value
2. **Registry** — last-used project path from `~/.agent-workspace/registry.yaml`; used when env var is absent
3. **null** — no confirmed home detected; operator must bootstrap

---

## Lifecycle Phases

### Phase 1: First Install

- Installer may **suggest** a workspace path as a candidate
- Installer must **not auto-select** a path without operator confirmation
- On confirmation, persist the choice:
  - Write `export AGENTICOS_HOME=<path>` to shell profile (e.g. `~/.zshrc`)
  - Register in `launchctl` environment on macOS
  - Set `AGENTICOS_HOME` in current session env

### Phase 2: Upgrade / Reinstall

- Before upgrade: detect existing `AGENTICOS_HOME` via env or registry
- If a confirmed home exists: **preserve it unchanged**
- If no confirmed home exists: behave as first install
- **Do not** emit caveats suggesting a new default runtime home (e.g. `/opt/homebrew/var/agenticos`) when a confirmed home is already in force
- After upgrade: verify MCP registration still carries the confirmed `AGENTICOS_HOME`

### Phase 3: Bootstrap

- Accept `--workspace <path>` to set an explicit workspace
- Accept pre-confirmed `AGENTICOS_HOME` without prompting
- Candidate paths from `detectDefaultWorkspace` are **suggestions only**, not implicit selections
- Bootstrap must inject explicit `AGENTICOS_HOME` into all supported MCP registration surfaces (Claude Code, Codex, Cursor, Gemini CLI)

### Phase 4: Restart Contract

The operator must restart the current AI client after any of:

| Trigger | Reason |
|--------|--------|
| `agenticos-mcp` upgrade/reinstall | Binary may have changed |
| MCP registration change | AI client needs to pick up new registration |
| `AGENTICOS_HOME` change | Client env must match new home |

**Verification:** `agenticos_list` must succeed after restart — this confirms the registration and home are coherent.

### Phase 5: Migration (Explicit Operator Action Only)

- Migrating to a new `AGENTICOS_HOME` is an **explicit, separate operator action**
- It requires:
  1. Backing up the existing workspace
  2. Running `agenticos_bootstrap` with the new `--workspace` value
  3. Updating MCP registration to carry the new home
  4. Restarting the AI client
- No surface should initiate this automatically

---

## Surface Alignment

| Surface | Current Behavior | Required Behavior |
|---------|----------------|-----------------|
| `agenticos-bootstrap` | Requires explicit `--workspace` or pre-confirmed home | ✅ Already correct |
| `agenticos-mcp` (MCP registration) | Carries `AGENTICOS_HOME` from env | ✅ Already correct |
| `registry.yaml` | Persists project paths | ✅ Already correct |
| `detectDefaultWorkspace()` | Suggests candidates | ✅ Already correct |
| `shell-profile` update | Writes/updates `export AGENTICOS_HOME=...` | ✅ Already correct |
| Homebrew formula caveats | Previously suggested `/opt/homebrew/var/agenticos` as default | ⚠️ Needs update to respect confirmed home |
| Product README | Previously described multiple conflicting home stories | ⚠️ Needs consolidation |

---

## Implementation

- `getCanonicalAgenticosHome()` in `mcp-server/src/utils/registry.ts` — canonical resolution function
- `agenticos_bootstrap` — already enforces explicit workspace confirmation
- `agenticos_config` — surfaces should report both env and registry-derived values

---

## Non-Goals

- This contract does not cover automatic migration of existing workspaces
- It does not redesign project layout or worktree topology
- It does not reopen release-parity issues (#266, #302)

---

## Related

- `#134` — fail-fast explicit `AGENTICOS_HOME`
- `#157` — transactional bootstrap with explicit env injection
- `#218` — explicit workspace confirmation only
- `#277` — docs conflict evidence
- `#152` — older Homebrew workspace decision (superseded)
