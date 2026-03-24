# AgenticOS Roadmap

> AI-native project management — persist context across sessions for any MCP-compatible AI tool.

## v0.2.0 — Current Release

**Theme**: Core infrastructure + developer workflow

- [x] MCP Server with 9 tools (init, switch, list, status, record, save, preflight, branch bootstrap, pr scope check) + 1 resource
- [x] Three-layer architecture: Universal Protocol → MCP Server → Agent-Specific Config
- [x] Session recording: conversations/ + state.yaml auto-sync to CLAUDE.md
- [x] Template versioning with auto-upgrade on project switch
- [x] Registry with relative paths — cross-machine portable
- [x] GitHub Releases + Homebrew distribution
- [x] CI pipeline (TypeScript lint, build, test)
- [x] Open-source workflow: Issue → Branch → PR
- [x] Integration mode decision: `MCP-native` primary, `MCP + Skills Assist` supported fallback, `CLI Wrapper` limited fallback, `Skills-only Guidance` experimental

## v0.3.0 — Next

**Theme**: Cross-tool validation + developer experience

- [ ] Cross-tool verification: validate full workflow in Cursor and Codex
- [ ] Project DNA auto-population from first record
- [ ] `agenticos_search` — search across knowledge/ and conversations/
- [ ] `agenticos_archive` — archive completed projects
- [ ] Improved quick-start.md: auto-enrich on first session record
- [ ] CURSOR.md / AGENTS.md templates for non-Claude tools

## v1.0.0 — Future

**Theme**: Production-ready + ecosystem

- [ ] npm registry distribution (for npx usage)
- [ ] Project templates (custom init scaffolding)
- [ ] Team collaboration support (shared registries)
- [ ] Optional visualization dashboard
- [ ] Optional cloud sync backend
- [ ] Plugin/extension system for custom tools

## Non-Goals (v0.2.0)

These are explicitly deferred and will not be implemented in the current release:

- **memory.jsonl** — conversations/ + state.yaml serve this purpose
- **Project-level changelog.md** — git log is the changelog
- **npm publish** — GitHub Releases + Homebrew is the distribution strategy
- **External server dependencies** — all data stays local
