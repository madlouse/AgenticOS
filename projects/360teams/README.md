# 360Teams OpenCLI Adapter

opencli adapter that lets AI agents interact with 360Teams desktop app via `opencli 360teams <cmd>`.

Capabilities: send messages, read message history, search contacts, list groups, list conversations.

---

## Prerequisites

Before installing, verify these are present:

```bash
# 1. Homebrew
brew --version
# Expected: Homebrew 4.x.x

# 2. Node.js ≥ 18
node --version
# Expected: v18.x.x or higher

# 3. opencli
opencli --version
# Expected: any version. If missing: npm install -g @jackwener/opencli

# 4. 360Teams desktop app
ls /Applications/360teams.app
# Expected: /Applications/360teams.app (directory exists)
# If missing: install 360Teams before continuing
```

---

## Install

```bash
brew tap madlouse/360teams https://github.com/madlouse/homebrew-360teams
brew install teams-opencli
```

Verify install succeeded:

```bash
opencli 360teams status
```

Expected output: a table with `CDP` and `User` rows showing connection status. If 360Teams is not running, the adapter auto-launches it in debug mode — wait up to 30 s.

If `opencli 360teams status` exits with error, see [Troubleshooting](#troubleshooting).

---

## Upgrade

```bash
brew reinstall teams-opencli
```

`reinstall` (not `upgrade`) is required because Homebrew's `post_install` — which updates the symlink and SKILL.md — only runs on install and reinstall, not on upgrade.

---

## Uninstall

```bash
brew uninstall teams-opencli
brew untap madlouse/360teams
rm -rf ~/.opencli/cache/360teams      # optional: clear cache
rm -rf ~/.claude/skills/360teams      # optional: remove skill
```

---

## Commands

All commands are invoked as `opencli 360teams <name> [args]`.

### status
```bash
opencli 360teams status
```
Check CDP connection. Output: table with CDP reachability and current user. Use this to verify the adapter is working.

### me
```bash
opencli 360teams me
```
Current logged-in user. Cached 24 h. Output columns: `ID, Name, Mobile, Department`.

### search
```bash
opencli 360teams search --name <keyword> [--limit N]
```
Search contacts by name (case-insensitive partial match). Uses the contacts cache (1 h TTL) — no CDP call on cache hit.

Default limit: 10. Output columns: `ID, Name, Mobile, Department`.

Example:
```bash
opencli 360teams search --name 张三
```

### contacts
```bash
opencli 360teams contacts [--limit N] [--refresh true]
```
Full contact list. Default limit: 50. Cached 1 h. Pass `--refresh true` to force a fresh fetch from 360Teams.

Output columns: `ID, Name, Mobile, Department`.

### conversations
```bash
opencli 360teams conversations [--limit N]
```
Recent conversations with unread counts. Default limit: 20. **Not cached** (always live).

Output columns: `Type, TargetId, Title, Unread, LastMessage`.

### groups
```bash
opencli 360teams groups [--refresh true]
```
Joined groups. Cached 1 h. Pass `--refresh true` to force refresh.

Output columns: `ID, Name, MemberCount`.

### send
```bash
# Private message
opencli 360teams send --to <UserID> --msg "message text"

# Group message
opencli 360teams send --to <GroupID> --msg "message text" --type GROUP
```
Send a message. `UserID` and `GroupID` come from `search`, `contacts`, `conversations`, or `groups` output.

### read
```bash
# Private conversation
opencli 360teams read --target <UserID> [--limit N]

# Group conversation
opencli 360teams read --target <GroupID> --limit N --type GROUP
```
Read message history. Default limit: 20. **Not cached**.

Output columns: `Time, Sender, Type, Content`.

Note: `RichTextMessage` content is extracted from the `digest` field (plain-text summary). Images and file attachments show as empty `Content`.

---

## Cache

Cache files live at `~/.opencli/cache/360teams/` as JSON with embedded expiry timestamps.

| Data | TTL | How to refresh |
|------|-----|----------------|
| `me` (current user) | 24 h | Run `opencli 360teams me` after cache expires |
| `contacts` | 1 h | `opencli 360teams contacts --refresh true` |
| `groups` | 1 h | `opencli 360teams groups --refresh true` |
| conversations | none | always live |
| messages | none | always live |

Manually clear all cache:
```bash
rm -f ~/.opencli/cache/360teams/*.json
```

---

## Auto-launch behavior

When any command runs, `launcher.js` checks whether `http://localhost:9234/json` is reachable:

- **Reachable** → connect immediately (< 5 ms overhead).
- **Not reachable** → find `/Applications/360teams.app`, kill any existing process, relaunch with `--remote-debugging-port=9234`, poll until port opens (up to 30 s).

If 360Teams is not installed or the port is still not ready after 30 s, the command exits with a descriptive error and a manual fallback command.

Environment variables to override defaults:
```bash
TEAMS_CDP_HOST=localhost   # default
TEAMS_CDP_PORT=9234        # default
```

---

## Claude Code Skill

After install, `~/.claude/skills/360teams/SKILL.md` is present. Claude Code automatically invokes the skill when the user mentions sending or reading 360Teams messages.

The skill is read-only context for Claude — it does not affect CLI behavior.

---

## Troubleshooting

### `360Teams app not found`
```
Error: 360Teams app not found. Please install 360Teams and try again.
```
360Teams is not installed at `/Applications/360teams.app`. Install the app and retry.

### `CDP port not ready after 30s`
```
Error: 360Teams launched but CDP port 9234 not ready after 30s.
Try manually: open -a "/Applications/360teams.app" --args --remote-debugging-port=9234
```
Run the manual command shown in the error, wait 5 s, then retry.

### `No contacts found matching`
```
Error: No contacts found matching "xxx".
```
The keyword matched nothing in the contact list. Try a shorter keyword, or check `opencli 360teams conversations --limit 50` — the target may appear in `Title` column there.

### `send failed` / wrong message type
Sending to a group requires `--type GROUP`. Sending without the flag defaults to private message and will fail if the target ID is a group ID.

### Cache is stale
If contacts or groups look outdated, force refresh:
```bash
opencli 360teams contacts --refresh true
opencli 360teams groups --refresh true
```
