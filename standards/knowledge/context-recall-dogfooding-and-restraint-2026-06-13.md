# Context Recall: dogfooding and the restraint lesson (2026-06-13)

How the P1 "human–machine context" recall loop (#549) was built, shipped, and
proven — and the scope lesson that came out of it.

## What shipped (P1 recall minimal loop)

The system was "write-heavy, read-light, half-closed governance". P1 closed the
read half:

- **L2 Evolution Log** (#580a) — a git-tracked, append-only timeline at
  `<context>/evolution-log/YYYY-MM.yaml`. Full-mode `agenticos_record`
  auto-appends `kind: decision` entries with `refs.issue` stamped from the
  worktree branch (deterministic closure, not agent discipline). The
  distillation-ledger was hardened (lock + atomic write + corrupt-backup +
  unknown-field passthrough) but stays a machine-local capture queue — the
  shared timeline is the git-tracked log, so it travels with the repo.
- **L3 Recall** (#582) — `agenticos_recall`, deterministic v1 (issue lineage +
  CJK-aware keyword + recency; no vector store). Auto-injected server-side into
  `agenticos_issue_bootstrap` as a `recalled` field and surfaced by
  `agenticos_issue_start`. The acceptance is the *attention flow* (a zero-prior
  agent sees related history), not just the data flow.

Released in v0.4.41.

## The restraint lesson

A three-track review (architecture / journey / QA) produced a large fix list:
back-fill four lifecycle fields across 112 knowledge docs, add a GBrain vector
store, build a full human timeline, add event-driven auto-closing hooks. Doing
all of it before the loop had ever run would have been the classic failure mode
— building for imagined needs.

Instead the order was: **build the minimal loop → ship it → use it → let the
first real signal decide what's next.** The carrier decision (two-tier:
machine-local ledger vs git-tracked evolution log) was the one design change
worth making up front, because getting the *location* of shared memory wrong is
expensive to reverse. Everything else was deferred until data justified it.

## What the first real use found (#589)

The first dogfooding of `agenticos_recall` after release returned nothing for
obvious queries. Root cause: this project's `agent_context.knowledge` pointed at
`knowledge/` (which held only the empty case-store and one stray doc), while its
112 real docs lived in `standards/knowledge/`. Recall was faithfully scanning
the configured — but wrong — directory.

The fix was one config line (`knowledge/` → `standards/knowledge/`) plus moving
one stray doc, after verifying the case store was empty (no orphan risk) and that
nothing else pinned the old path. A config/layout drift, not a recall bug.

The point: had the review backlog been worked first, this real, load-bearing
problem (recall blind to the entire corpus) would have been buried under
speculative features. Shipping thin surfaced it immediately.

## Deferred on purpose (revisit when data warrants)

- **G3 per-doc lifecycle back-fill (#581)** — the field contract now exists
  (`owner`, `valid_until`, `supersedes`, `confidence`), health reports
  per-document stale/superseded/expired status, and recall annotates or
  down-weights stale lifecycle matches. Bulk back-fill remains judgment work:
  agents should update lifecycle fields when touching a document instead of
  pretending the system can decide obsolescence automatically.
- **GBrain semantic recall (#583)** — gate on the v1 recall *citation rate*; a
  vector store before the corpus has accumulated is premature.
- **Full human timeline (#584)** — now productized as
  `agenticos_evolution_timeline`, a human-readable view over the same L2
  evolution log used by recall.
- **Event-driven auto-closing hooks (L4)** — the prompt-based guards may suffice;
  observe before adding heavy automation.

The evolution-log corpus accumulates from ordinary worktree records going
forward — the loop feeds itself; no special action is needed to keep it growing.
