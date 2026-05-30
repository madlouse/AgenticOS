# Agentic Feature Design And Runtime Integration Standard

---
status: live
date: 2026-05-30
issue: "#497"
scope: feature/product design, runtime integration, and MCP/Skills activation validation
---

## Purpose

AgenticOS has one Git-backed development workflow, but not every product
requirement is a Git workflow requirement. Hermes routing, Discord project
threads, topic/project language, Skills activation, Homebrew upgrade behavior,
and MCP availability are feature and runtime-integration concerns first. They
inherit Git-backed execution rules only when implementation begins.

This standard defines that separation so agents do not flatten product design
requirements into code-development rules, while still preserving strict
AgenticOS execution discipline.

## Layer Model

| Layer | Owns | Examples | Enforced by |
| --- | --- | --- | --- |
| Universal agent execution | Intent, source, scope, project alignment, recording | MCP-first project switch, no raw transcript publication, issue-first work | Agent adapter surfaces, AgenticOS MCP guardrails |
| Feature/product design | User-facing behavior and product semantics | Hermes as router, Discord thread cockpit, topic/project wording | Design docs, lifecycle impact review, sub-agent review |
| Runtime integration | How the feature actually activates on a machine | MCP registration, Skills install, Homebrew caveats, agent restart/reload | Bootstrap, config validation, smoke tests |
| Git-backed implementation | Code change workflow for Git projects | branch/worktree, tests, PR/MR, CI, merge, cleanup | `preflight`, `branch_bootstrap`, `edit_guard`, `pr_scope_check`, Git host policy |

The Git-backed workflow remains the implementation carrier. It is not the
taxonomy for every design requirement.

## Classification Rule

When a requirement appears, classify it before implementing:

1. Universal execution rule: applies to all AgenticOS-managed work regardless
   of product feature.
2. Feature design rule: defines what the product should do or how users should
   experience it.
3. Runtime integration rule: defines how the feature is installed, activated,
   configured, validated, or repaired on a machine.
4. Git implementation rule: defines how source changes are made, reviewed,
   merged, and cleaned up.

Most non-trivial work crosses multiple layers. The agent must name the layers
instead of treating them as one generic "development rule".

## Hermes And Topic Routing Classification

The following are feature/runtime design requirements, not pure Git Flow
requirements:

- Hermes is a lightweight personal/work assistant and router.
- Heavy project work should be delegated to Codex or Claude Code workers under
  AgenticOS guardrails.
- Discord is the MVP threaded surface for project-oriented Hermes routing.
- Feishu thread routing is out of scope unless a separate integration reopens
  it.
- In user-facing Hermes/Discord language, topics and projects may both be
  called projects.
- Internally, AgenticOS may still track `project_kind=topic|project` or other
  routing metadata.
- Default worker backend is Codex unless the operator explicitly asks for
  Claude Code or another backend.
- Machines without Hermes or Discord must keep the normal AgenticOS MCP
  workflow.

These rules affect product behavior, routing, optional dependencies, and
operator experience. If code changes are required to implement them, that code
then uses the Git-backed workflow.

## Feature Design Requirements

Before implementation, feature design must answer:

- User outcome: what behavior should the operator observe?
- Owning layer: feature design, runtime integration, Git implementation, or a
  combination.
- Canonical data plane: MCP-native unless explicitly documented as a limited
  fallback.
- Optional dependencies: what remains functional when optional systems such as
  Hermes, Discord, browser automation, or a specific agent runtime are absent?
- Compatibility: fresh install path, existing upgrade path, restart/reload
  requirement, migration/repair path, and rollback guidance.
- Privacy boundary: what data is tracked, distilled, private sidecar, or never
  persisted?
- Verification evidence: which local commands, smoke tests, or external checks
  prove the feature works?

For ambiguous architecture or integration work, run analysis/Plan Mode and use
sub-agent review before implementation.

## Runtime Integration Requirements

Runtime integration changes include:

- MCP server registration or command invocation changes.
- Skills install, update, overwrite, or conflict behavior.
- Homebrew formula, post-install, caveat, or verification behavior.
- Agent adapter surfaces such as `AGENTS.md`, `CLAUDE.md`, and generated Skills.
- Long-lived agent sessions that need restart or reload before new tools become
  visible.
- Optional platform integrations such as Hermes, Discord, browser automation,
  or external service credentials.

These changes require lifecycle impact analysis. Normal upgrades must not
silently rewrite user runtime config, persisted state, credentials, or
user-customized Skills.

## MCP And Skills Activation Validation

After an AgenticOS upgrade that is expected to change agent behavior, the
release or rollout evidence must distinguish package installation from runtime
activation.

Minimum validation chain:

1. Install or upgrade:

   ```bash
   brew update
   brew upgrade agenticos
   agenticos-config --validate
   ```

2. Refresh generated runtime surfaces:

   ```bash
   agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --verify
   ```

3. If Hermes/Discord routing is in scope, run the Hermes-specific verification
   flag documented by the release or rollout:

   ```bash
   agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --verify --verify-hermes-discord
   ```

4. Restart or reload long-lived agents that cache MCP tool lists, Skills, or
   adapter instructions.

5. In each target runtime, verify tool discovery before relying on the new
   behavior:

   - Codex: AgenticOS MCP tools are discoverable, and project switch prompts
     trigger MCP/tool discovery before shell directory search.
   - Claude Code: AgenticOS MCP server is registered in the Claude runtime, and
     `CLAUDE.md`/Skills guidance reflects the current standard-kit version.
   - Hermes: optional; if configured, Hermes can resolve a project through
     AgenticOS MCP before creating or reusing any Discord thread.

6. Run a project-switch smoke:

   - Ask to switch to a known AgenticOS project.
   - Confirm the agent calls AgenticOS MCP or tool discovery first.
   - Confirm it uses the returned project path as explicit workdir.
   - Confirm it does not claim success from `cd`, `pwd`, `find`, or Git branch
     inspection alone.

If any step fails, the agent must report runtime activation as incomplete. A
successful Homebrew upgrade alone is not enough to claim the upgraded MCP
behavior is active inside Codex, Claude Code, or Hermes.

## Compatibility Requirements

Feature and runtime integration work must preserve installed machines:

- Existing project metadata remains readable.
- User-customized Skills or adapter files are not overwritten unless the
  operator requests a force refresh.
- Runtime config changes use explicit repair or migration commands where
  practical.
- Secrets and PATs are represented as platform secret-store setup and
  verification, not as chat input or repository content.
- Missing optional systems degrade clearly. For example, no Hermes/Discord
  setup means no Discord thread routing, but normal AgenticOS MCP project
  switching still works.

## Relationship To Git-Backed Development

This standard does not weaken the Git-backed workflow. It narrows where that
workflow applies.

When feature design leads to source changes in a Git-backed project, the
implementation must still use:

`issue -> preflight -> branch_bootstrap -> issue_bootstrap -> preflight -> edit_guard -> tests -> pr_scope_check -> PR/MR -> CI -> merge -> cleanup`

GitHub, GitLab, Gitee, and generic Git remotes share this local AgenticOS
workflow. Provider differences only affect review/CI evidence collection.

## Review Checklist

For PRs or design docs that touch feature/runtime integration, reviewers should
check:

- Are feature/product requirements separated from Git implementation rules?
- Does the design name the canonical data plane and any fallback limits?
- Does it define behavior when optional integrations are absent?
- Does it include fresh-install and existing-upgrade validation?
- Does it state whether agent restart/reload is required?
- Does it include an MCP/Skills activation smoke when agent behavior changes?
- Does it avoid publishing raw transcripts or secrets?
- If code changes exist, did the branch pass normal AgenticOS Git guardrails?

## Outcome

Agents should now treat Hermes routing, topic/project user-facing semantics,
and MCP/Skills activation as feature/runtime integration design topics. They
still use the Git-backed execution flow when code changes begin, but their
requirements are specified and reviewed at the correct layer first.
