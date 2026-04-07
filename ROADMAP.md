# AgenticOS Roadmap

> AI-native project management that persists context across sessions for
> MCP-capable AI tools.

## v0.4.x — Current Release Line

**Theme**: workspace and product-source separation

- [x] explicit project topology (`local_directory_only` vs `github_versioned`)
- [x] source-repo boundary enforcement for implementation-affecting work
- [x] canonical-main runtime write protection
- [x] runtime recovery audit for workspace cutover
- [x] root Git exit audit for workspace-home cutover
- [ ] finish root Git retirement so workspace home is no longer the product repo

## v0.5.x — Next

**Theme**: stable self-hosting and operator experience

- [ ] standalone product-repository root under `projects/agenticos`
- [ ] release and CI surfaces rooted in the product project
- [ ] explicit workspace selection and recovery flows across supported clients
- [ ] stronger audit coverage for root-Git exit and product-root readiness

## v1.0.0 — Future

**Theme**: production-ready ecosystem

- [ ] project templates and richer bootstrap ergonomics
- [ ] team collaboration support
- [ ] optional visualization/dashboard surfaces
- [ ] optional cloud synchronization
- [ ] plugin or extension system for custom tools
