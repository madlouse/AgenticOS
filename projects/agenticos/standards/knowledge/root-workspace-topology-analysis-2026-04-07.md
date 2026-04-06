# AgenticOS Root Workspace Topology Analysis

> Date: 2026-04-07
> Issue: #193
> Purpose: evaluate whether the enclosing `AGENTICOS_HOME` root should remain a Git repository and define the phased path to a cleaner workspace-first model

## 1. Decision

The target model should be:

- `AGENTICOS_HOME` is a workspace root, not the default AgenticOS product-source repository
- `projects/agenticos` is the canonical AgenticOS product project
- sibling entries under `projects/` are ordinary child projects
- child projects may be either:
  - `github_versioned`
  - `local_directory_only`

This is a continuation of the self-hosting direction, but with one critical correction:

the enclosing workspace root must stop acting like the canonical Git-backed product repository.

## 2. Why the Current Layout Still Feels Wrong

Today the enclosing `AgenticOS/` root is still doing too many jobs at once.

It currently contains:

- product-source paths
  - root docs
  - `.github/`
  - `mcp-server/`
  - `scripts/`
  - `tools/`
- workspace metadata
  - `.agent-workspace/registry.yaml`
- runtime/helper areas
  - `worktrees/`
  - `.private/`
- managed child projects
  - `projects/*`

That means one filesystem root is simultaneously:

1. product source
2. workspace home
3. project container
4. runtime helper area

This is the real source of confusion.

## 3. The Hard Contradiction

The README already states that a source checkout should stay separate from the live `AGENTICOS_HOME` workspace.

But the current local layout still uses the same enclosing root for both.

That creates two concrete problems:

1. normal workspace behavior dirties source control
   - `agenticos_switch`
   - `agenticos_record`
   - registry updates
   - runtime worktree bookkeeping

2. source inclusion becomes structurally ambiguous
   - local-only project roots live under a Git-backed parent
   - external child repos can look like nested source instead of child projects
   - it becomes harder to explain what should be backed up, published, or ignored

## 4. What the Product Model Should Be

The clean model is:

### Workspace root

- stores registry and portable workspace metadata
- stores local-only child projects
- stores runtime or helper areas that belong to the user's workspace
- may be backed up by the user if desired
- is not itself the authoritative AgenticOS product source repo

### Product project

- lives at `projects/agenticos`
- owns the AgenticOS product contracts and implementation
- evolves by issue, branch, review, and release flow
- is installed and executed through normal packaging paths such as Homebrew

### Other child projects

- live under `projects/*`
- are either:
  - `github_versioned`
  - `local_directory_only`
- are governed by AgenticOS project rules, not by the accidental fact that the parent workspace root once had a `.git`

## 5. Why Homebrew Matters Here

The user goal is correct:

- installed AgenticOS binaries should come from standard packaging, such as Homebrew
- runtime execution should use those installed entrypoints
- source checkouts should be for development, not for silently doubling as production execution state

That separation matters because it prevents:

- source checkouts becoming contaminated by runtime writes
- runtime correctness depending on a local development tree
- local machine development layout from leaking into the operating model

## 6. Root-Level Rules That Are Still Missing

Project-level topology is already partially solved:

- init requires explicit topology
- switch fails closed for non-normalized projects
- `github_versioned` projects require source bindings

But root-level topology is still missing.

The system still lacks explicit rules for:

1. whether `AGENTICOS_HOME` may itself be a Git product repo
2. which root paths are product-source exceptions during migration
3. which workspace writes must never dirty canonical product source
4. when a local-only child project under `projects/` must be excluded from source control

## 7. Recommended Migration Strategy

This should be phased, not done as one directory move.

### Phase 1: Freeze the root contract

Define formally that:

- `AGENTICOS_HOME` is a workspace-first root
- `projects/agenticos` is the product project
- the enclosing root Git repository is transitional, not the intended end state

Output:

- policy and migration contract
- explicit allowed root exceptions

### Phase 2: Remove write pollution from the enclosing root

Normalize runtime and workspace mutations so ordinary operations do not dirty canonical product source by default.

Examples:

- registry writes
- generated compatibility surfaces
- helper/worktree bookkeeping

Output:

- normal operations can run without contaminating the product-source checkout

### Phase 3: Normalize child project inclusion

Audit child projects under `projects/` and classify each as:

- `github_versioned`
- `local_directory_only`
- archived/reference-only

Then align source inclusion accordingly.

Output:

- no child project is left in an ambiguous state because of parent-root Git semantics

### Phase 4: Detach the workspace root from product-source Git

Once packaging, migration, and child-project inclusion are stable:

- stop treating the enclosing workspace root as the AgenticOS product repo
- keep product-source ownership inside `projects/agenticos`
- let the workspace root behave like a normal AgenticOS home

Output:

- the workspace root is conceptually and operationally clean

## 8. Practical Near-Term Guidance

Until the full migration completes:

- treat the current enclosing root Git repository as transitional only
- do not treat root-level workspace writes as harmless product-source edits
- continue using issue worktrees for AgenticOS implementation changes
- keep classifying child projects explicitly instead of inheriting behavior from the parent root

## 9. Final Judgment

The long-term model should not be "root Git plus more ignore rules".

The long-term model should be:

- workspace root
- child projects
- product project under `projects/agenticos`
- installed runtime via packaged binaries

That is the only arrangement that matches:

- the self-hosting direction
- the user-facing mental model
- the topology rules already introduced for child projects
