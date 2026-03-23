# AgenticOS Post Self-Hosting Follow-Up Plan

> Date: 2026-03-23
> Purpose: capture the concrete next-priority work after the self-hosting migration landed

## 1. What Is Now Settled

The following is no longer speculative:

- AgenticOS now self-hosts under `projects/agenticos/`
- standards now live under `projects/agenticos/standards/`
- the relocated product build works from `projects/agenticos/mcp-server`
- the clean-install baseline problem was real and required a separate fix before migration could proceed

These are no longer design assumptions.
They are execution-backed facts.

## 2. What Execution Taught Us

### Lesson 1: repository automation is not just another product directory

`.github/` cannot be treated like ordinary product-source content.

It must remain at repository root because GitHub Actions workflow discovery is root-scoped.

Implication:
- future layering and relocation rules need an explicit root-scoped infrastructure exception

### Lesson 2: issue-first is not enough without base-branch guardrails

The first `#43` PR was incorrectly based on a local branch ahead of `origin/main`, so it accidentally included unrelated commits.

Implication:
- future guardrails must check remote base ancestry, not only branch naming
- PR scope validation needs to detect accidental extra commits before opening or merging

### Lesson 3: clean reproducibility is a real migration gate

Migration did not fail because of path rewrites first.
It failed because `npm ci` exposed a lockfile drift.

Implication:
- baseline reproducibility checks must remain mandatory before structural work
- `npm ci` should stay the canonical clean-checkout gate where reproducibility matters

### Lesson 4: self-hosting solved one ambiguity but not the whole workspace problem

The host product is now positioned correctly, but real runtime projects still remain tracked under `projects/`.

Implication:
- runtime extraction and workspace separation remain open follow-up work
- self-hosting was a major prerequisite, not the final portability state

## 3. Highest-Value Next Priorities

### Priority A: guardrails

Now that the repository model is real, the next weak point is execution correctness.

Most valuable guardrails:
- verify current branch is cut from the intended remote base
- verify PR diff does not include unrelated commits
- verify issue/branch/worktree alignment before implementation begins
- verify root-scoped infrastructure exceptions such as `.github/`

### Priority B: downstream standards kit

The standards are now anchored in a real product layout.

The next packaging step should define:
- what downstream projects inherit from `projects/agenticos/standards/`
- what remains repository-specific
- what is root-scoped infrastructure versus project-scoped standards

### Priority C: runtime extraction

The root repository still tracks real runtime projects.

The next portability step should:
- classify which `projects/*` entries are runtime
- define extraction and de-tracking order
- define the relationship between the product source repo and the live `AGENTICOS_HOME` workspace

## 4. Suggested Immediate Sequencing

Recommended order after self-hosting:

1. strengthen guardrails from real execution failures
2. package the standards into a reusable downstream kit
3. execute runtime workspace extraction from the product source repo

This order matters:
- guardrails reduce the chance of repeating execution mistakes
- packaging stabilizes what downstream projects should inherit
- extraction should happen after the target operational model is clearer

## 5. Canonical Follow-Up Questions

The next iteration should answer these precisely:

1. Which paths are root-scoped infrastructure exceptions and can never be blindly relocated?
2. How should an agent prove its branch is based on the correct remote base before implementation starts?
3. What exact files make up the downstream standards kit from `projects/agenticos/standards/`?
4. Which current `projects/*` entries are runtime projects versus fixtures or examples?
