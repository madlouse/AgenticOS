# Sub-Agent Inheritance Protocol - 2026-03-25

## Design Reflection

Issue `#28` is not about whether sub-agents are useful.

It is about making sub-agent startup predictable.

Without a contract, the parent agent either:

- sends too little context and the sub-agent starts context-blind
- sends an ad hoc summary with no verification step
- or asks the sub-agent to rediscover the same project state from scratch

That produces drift, duplicated work, and unverifiable delegation.

The adopted design is:

- define one required inheritance packet
- define one required verification loop
- encode both into the standard kit templates and standards agent docs

## Required Inheritance Packet

Before spawning a sub-agent for substantive work, the parent agent must pass at least:

1. project identity
2. current task / issue scope
3. key constraints and non-goals
4. relevant knowledge files
5. relevant task brief or execution plan
6. expected output shape
7. verification expectations

The parent should not delegate using only a free-form one-line summary when the task is non-trivial.

## Required Verification Behavior

Before editing or producing final output, the sub-agent must confirm:

1. what project it believes it is in
2. what problem it is solving
3. what constraints it must not violate
4. what evidence it will return

If that understanding is incomplete, the sub-agent should stop and request clarification from the parent agent instead of guessing.

## Persistence Rules

The parent agent remains responsible for canonical persistence.

The sub-agent may produce:

- implementation output
- review findings
- design alternatives
- verification evidence

But important results must be distilled back by the parent into the project's canonical files:

- `knowledge/`
- `tasks/`
- `.context/state.yaml`
- submission evidence

## Template Implications

The downstream standard kit should now include:

- a sub-agent handoff template
- explicit sub-agent packet fields in the issue design brief
- explicit sub-agent verification fields in submission evidence

## Simulation Scenario

Minimal verification scenario:

1. parent agent opens an issue design brief
2. parent fills the sub-agent inheritance packet
3. sub-agent restates project, task, constraints, and expected output
4. sub-agent returns work plus evidence
5. parent records the distilled result into canonical project state

## Outcome

After this issue, sub-agent collaboration is no longer a pure prompt habit.

It becomes a standard-kit-backed protocol that downstream projects can adopt and audit.
