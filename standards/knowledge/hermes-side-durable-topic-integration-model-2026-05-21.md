# Hermes-Side Durable Topic Integration Model - 2026-05-21

## Purpose

Issue #441 defines how AgenticOS should support Hermes-side long-running topics.
The goal is not to turn Hermes into a project execution OS. The goal is to give
Hermes a clear escalation path when a chat becomes durable work.

This model depends on the #439 conclusion:

- Hermes is the lightweight assistant and coordination side.
- GBrain is shared durable semantic memory.
- AgenticOS is the canonical project/topic OS for state, tasks, artifacts,
  guardrails, and knowledge evolution.
- Codex and Claude Code are production execution agents governed by AgenticOS
  workflow.
- Skills help agents discover AgenticOS before MCP lazy-load issues, but MCP is
  still the source of truth.

## Product Decision

AgenticOS should introduce a lightweight durable-topic path as a specialization
of the existing managed-project model, not as a separate runtime.

MVP rule:

- An AgenticOS topic is an AgenticOS-managed project whose primary output is
  durable knowledge, decisions, tasks, and artifacts rather than a software
  release.
- The default topology for a personal or assistant-mediated topic is
  `local_directory_only` with private continuity.
- A topic upgrades to `github_versioned` only when it becomes a reusable
  capability, tool, public framework, or release-managed product surface.
- The same memory-layer contract applies: `.context` for current operational
  state, `knowledge/` for durable synthesis, `tasks/` for planned work, and
  `artifacts/` for outputs.

Future implementation may add an explicit metadata field such as
`agenticos.project_kind: topic`, but the product should not wait for that field
to use the model. Existing `local_directory_only` projects can already carry
this behavior.

## Five Routing Paths

Use the smallest durable surface that satisfies the task.

| Path | Use when | Primary owner | Durable write | Escalation trigger |
| --- | --- | --- | --- | --- |
| Chat-only | The request is one-off, low-stakes, and has no likely reuse | Hermes | None by default | User asks to remember, repeat, compare later, or continue across sessions |
| Hermes memory | The information is a stable preference, identity cue, routine, or assistant behavior setting | Hermes | Hermes local memory | The fact needs cross-agent retrieval or evidence-backed synthesis |
| GBrain knowledge | The information is durable semantic knowledge useful across agents: people, concepts, decisions, research summaries, links, entities, timelines | GBrain | GBrain page/entity/relation | The work gains active tasks, current state, artifacts, or multi-session planning |
| AgenticOS topic | The subject is recurring and needs current state, tasks, decisions, artifacts, or knowledge evolution, but is not primarily a release-managed repo | AgenticOS | AgenticOS topic directory plus optional GBrain distilled summary | The topic becomes a reusable capability, codebase, automation, or product surface |
| AgenticOS project | The work changes code/config, needs issue/PR/release flow, has rollback risk, or represents a maintained capability | AgenticOS | Git-managed project context, issue branch/worktree, PR evidence | Not an escalation target; this is the full execution path |

## Trigger Rules

### Stay Chat-Only

Stay in normal Hermes chat when all of these are true:

- The answer can be completed in the current interaction.
- There is no durable decision, task, or artifact.
- The user did not ask to remember, track, compare, or continue later.
- The result does not need Codex/Claude execution or file changes.

Examples:

- "帮我润色这句话。"
- "今天这个报错是什么意思？" when no follow-up investigation is requested.
- A quick recommendation that will not be reused.

### Use Hermes Memory

Use Hermes memory when the item is a small assistant-continuity fact:

- preferred communication style
- common personal/work routines
- aliases, identities, and stable relationships
- lightweight preference such as "默认中文回复"

Do not use Hermes memory for:

- raw secrets
- large research notes
- project state
- operational task lists
- evidence that must be audited later

### Use GBrain Knowledge

Write or update GBrain when the item should be retrieved by multiple agents but
does not itself need AgenticOS workflow state.

Good GBrain writes are:

- distilled research summaries
- decisions and their rationale
- people/company/project concept pages
- references to credential locations such as `op://...`, not secrets
- links between topics, projects, and prior decisions

GBrain should not become:

- an AgenticOS project registry
- a raw transcript sink
- a substitute for `.context/state.yaml`
- a task board for active execution

### Create Or Switch An AgenticOS Topic

Use an AgenticOS topic when any of these are true:

- The subject is expected to continue across sessions.
- There are current tasks, open questions, or follow-up commitments.
- Multiple research sources or decisions need to be synthesized over time.
- The user wants the topic to evolve, not just be remembered.
- Hermes needs Codex or Claude Code to produce artifacts, structured research,
  or validation work while preserving continuity.

Default topic properties:

```yaml
topology: local_directory_only
source_control.context_publication_policy: local_private
primary_surfaces:
  - .context/quick-start.md
  - .context/state.yaml
  - knowledge/
  - tasks/
  - artifacts/
```

An AgenticOS topic can still use GBrain. The boundary is:

- AgenticOS owns current state, tasks, artifacts, and topic-level knowledge.
- GBrain owns cross-agent semantic summaries and retrieval links.

### Use A Full AgenticOS Project

Use a full project when the work needs engineering execution:

- code, config, package, CI, deployment, or release changes
- issue-first work with rollback requirements
- pull request review and GitHub checks
- reusable tools, plugins, skills, MCP servers, or automation
- a capability that should be maintained beyond private personal use

For a `github_versioned` project, Codex and Claude Code must follow the normal
AgenticOS issue workflow: issue bootstrap, isolated worktree, preflight, edit
guard, scope check, PR, CI, merge, and cleanup.

## Data Boundary

| Surface | Stores | Must not store | Freshness expectation |
| --- | --- | --- | --- |
| Hermes local memory | Small assistant-continuity facts and preferences | raw secrets, task state, raw transcripts, project registry | Updated opportunistically by Hermes |
| GBrain | Durable semantic knowledge, entities, summaries, timelines, cross-agent links | raw credentials, raw private logs, AgenticOS current state | Updated when knowledge should be reused across agents |
| AgenticOS topic | current topic state, active questions, tasks, artifacts, durable topic knowledge | unrelated global memory, raw secrets, full chat dump by default | Updated at session boundaries and after meaningful topic changes |
| AgenticOS project | project state, issues, worktrees, PR evidence, release knowledge, guardrail evidence | Hermes-only preferences, GBrain-only entity graph | Updated through strict execution workflow |
| Private raw sources | evidence logs, raw captures, local files | public distilled docs, secret material without local redaction | Accessed only when audit/recovery requires it |

## Hermes-To-AgenticOS Flow

Hermes should route durable work in this order:

1. Classify the request using the five routing paths.
2. If an AgenticOS topic or project is needed, prefer AgenticOS MCP directly.
3. Use `agenticos_switch` for existing topics/projects or `agenticos_init` for a
   new managed topic/project.
4. Treat the returned project path and recommended explicit workdir as
   authoritative.
5. If AgenticOS MCP tools are not available, do not claim the switch happened.
   Ask the operator or execution agent to repair AgenticOS MCP/Skill bootstrap.
6. Use GBrain for background retrieval and cross-agent summaries, but write
   current state and tasks into the AgenticOS topic/project.
7. At session end, distill stable learning to GBrain only if it should be
   retrievable outside the topic.

## Codex And Claude Code Escalation

Hermes should involve Codex or Claude Code when the topic needs:

- code or configuration changes
- structured artifacts beyond a chat answer
- deep repository inspection
- repeatable validation
- PR, CI, release, or rollback workflow
- a larger research synthesis that should land in `knowledge/` or `artifacts/`

Execution-agent contract:

1. The execution agent must discover and call AgenticOS MCP before filesystem
   guessing.
2. For project switching, `agenticos_switch` is authoritative. Shell `cd`,
   directory search, or git branch detection are not substitutes.
3. The execution agent must use the explicit workdir returned by AgenticOS.
4. For `github_versioned` work, the execution agent must follow the full
   issue-first workflow.
5. For topic-only work, the execution agent should still update the topic's
   `knowledge/`, `tasks/`, or `artifacts/` deliberately and record what changed.

This is exactly where the v0.4.25 activation Skill belongs: it helps Codex and
Claude Code remember to discover AgenticOS MCP first. It must not carry project
state itself.

## MVP Personal Topic Flow

Example topic: personal cognition and sleep improvement.

### Session 1: lightweight chat

User asks Hermes a one-off question about sleep quality. Hermes answers in chat.
No durable write is required.

### Session 2: memory signal

User says: "以后帮我记住，我晚上运动后睡眠会受影响。"

Hermes writes a small local memory fact. If the user wants cross-agent
retrieval, Hermes also writes a distilled GBrain note such as:

```text
User observation: evening workouts may correlate with worse sleep quality.
Evidence level: self-observed, not medical conclusion.
```

No AgenticOS topic is required yet.

### Session 3: durable topic signal

User says: "我们持续研究和迭代我的睡眠、精力和认知提升。"

Hermes creates or switches an AgenticOS topic, for example:

```text
personal-cognition-sleep
```

Recommended topic surfaces:

```text
.context/quick-start.md
.context/state.yaml
knowledge/sleep-and-cognition-research.md
knowledge/decision-log.md
tasks/next-experiments.md
artifacts/
```

AgenticOS topic state should track:

- current focus
- open questions
- active experiments
- decisions and reversals
- useful research summaries
- next-session resume point

GBrain should keep a short cross-agent summary and links to the AgenticOS topic,
not duplicate the whole topic state.

### Session 4: execution-heavy escalation

User asks to build an Apple Health export analyzer or a recurring report.

This crosses into capability work. Hermes should route to Codex or Claude Code,
and the execution agent should use AgenticOS MCP to create or switch a full
AgenticOS project. If the output becomes a reusable tool, choose
`github_versioned` and use issue/PR/release workflow.

## MVP Work Topic Flow

Example topic: Hermes-side follow-up for a lightweight workstream.

1. Hermes handles a quick Weixin/Feishu request in chat.
2. If the workstream becomes recurring, Hermes creates an AgenticOS topic with
   `local_directory_only`.
3. GBrain stores reusable entity knowledge: people, systems, glossary, and
   stable decisions.
4. AgenticOS stores current tasks, artifacts, and the resume point.
5. If the workstream creates or modifies a reusable integration, automation, or
   internal tool, Hermes escalates it to a full AgenticOS project and invokes
   Codex/Claude through AgenticOS MCP.

Hermes Agent is an integration sample for this flow. AgenticOS remains the
owning product surface for topic/project continuity.

## Verification Model

Before implementing new tools, validate the model with scenario tests:

| Scenario | Expected route | Pass condition |
| --- | --- | --- |
| One-off answer | Chat-only | No durable write |
| Stable assistant preference | Hermes memory | Preference is stored locally, not in AgenticOS state |
| Cross-agent research summary | GBrain knowledge | Distilled summary is retrievable by Hermes/Codex/Claude |
| Recurring personal development topic | AgenticOS topic | Topic has current state, tasks, and knowledge surfaces |
| Topic needs code/tooling | AgenticOS project | Execution agent follows issue/worktree/PR workflow |
| AgenticOS MCP unavailable | Recovery path | Agent says switch did not complete and requests bootstrap/repair |
| Raw secret appears | Block/redact | Secret is not written to Hermes memory, GBrain, or AgenticOS docs |

End-to-end smoke test:

1. Ask Hermes to continue a known AgenticOS topic.
2. Hermes or the delegated execution agent calls AgenticOS MCP before filesystem
   discovery.
3. AgenticOS returns the authoritative project path and explicit workdir.
4. The agent writes a small topic update into `knowledge/` or `tasks/`.
5. GBrain receives only the distilled cross-agent summary and link/reference.
6. A later session can recover the topic from AgenticOS state without reading
   raw chat logs.

## Non-Goals

- Do not make Hermes a full project execution OS.
- Do not make GBrain the AgenticOS project registry.
- Do not treat Skills-only routing as a supported runtime mode.
- Do not force every recurring personal topic into GitHub Flow.
- Do not duplicate the whole AgenticOS topic state into GBrain.
- Do not store raw secrets or raw private transcripts in durable shared memory.

## Follow-Up Implementation Backlog

| Priority | Item | Scope |
| --- | --- | --- |
| P0 | Document topic creation examples in user-facing bootstrap docs | Show how to create/switch `local_directory_only` topics from Hermes/Codex/Claude |
| P1 | Add optional `project_kind: topic` metadata | Make topic/project distinction machine-readable without changing the runtime model |
| P1 | Add knowledge-evolution health surface | Report capture, state, knowledge, dirty-WIP, and adapter freshness |
| P1 | Add distillation ledger | Track whether session captures became knowledge, tasks, or were intentionally ignored |
| P2 | Add scenario tests for routing prompts | Prevent regression where agents bypass MCP and only `cd` into guessed directories |
| P2 | Add GBrain reference convention | Standardize how AgenticOS topics link to GBrain pages without duplicating state |

## Conclusion

The Hermes-side integration should be light at the edge and strict at the
moment work becomes durable. Chat stays chat. Memory stays memory. GBrain holds
shared semantic knowledge. AgenticOS owns durable topic and project continuity.

That boundary lets Hermes remain a fast personal/work assistant while giving
long-running topics a real operating system when they need one.
