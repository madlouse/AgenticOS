# Homebrew Post-Install Contract - 2026-03-25

## Design Reflection

Issue `#30` is not about adding more installation channels.

It is about preventing one misleading product state:

- **package installed**
- but **agent not actually bootstrapped**

The design problem was inconsistency across the four Homebrew-facing surfaces:

1. root README
2. tap README
3. formula `post_install`
4. formula `caveats`

The adopted decision is:

- Homebrew is **reminder-only** today
- it installs the package and a seed workspace
- it does **not** silently mutate user AI tool configs
- it does **not** claim activation until the user bootstraps a supported agent, restarts it, and verifies `agenticos_list`

This issue intentionally reuses the official supported-agent set frozen in issue `#29`.

It does not redesign fallback integration modes.
