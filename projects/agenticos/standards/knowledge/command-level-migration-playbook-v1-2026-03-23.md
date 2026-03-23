# AgenticOS Command-Level Migration Playbook v1

> Date: 2026-03-23
> Purpose: define a command-level, verification-first playbook for self-hosting migration planning

## 1. Important Status Before Execution

Current baseline observations:

- `mcp-server` builds successfully from the current root
- the top-level product repository worktree is **not clean**

So the first execution gate is not "move files".
It is:

- isolate migration work from unrelated changes
- capture a clean baseline snapshot

Without that, later verification signals are not trustworthy.

## 2. Execution Rule

For every step below:

1. run pre-check commands
2. confirm pass conditions
3. perform one bounded change
4. run post-check commands immediately
5. if any post-check fails, stop and rollback that step only

## 3. Step 0: Baseline Isolation

### Goal

Create a clean, reviewable migration baseline before any structural move.

### Pre-check

```bash
git status --short --branch
git rev-parse HEAD
```

### Required pass condition

- unrelated changes are understood
- migration work will not be mixed with them silently
- a dedicated migration branch/worktree plan exists

### If fail

- stop
- do not start file relocation

## 4. Step 1: Build Baseline Verification

### Commands

```bash
cd /path/to/AgenticOS/mcp-server
npm install
npm run build
```

### Pass condition

- TypeScript build succeeds from the current root layout

### Rollback

- none; this is a read-only verification gate

## 5. Step 2: Path Inventory Verification

### Commands

```bash
cd /path/to/AgenticOS
find . -maxdepth 1 -mindepth 1 | sort
find projects/agentic-os-development -maxdepth 2 -mindepth 1 | sort
rg -n "projects/agentic-os-development|mcp-server/|homebrew-tap/|\\.meta/|\\.github/|tools/|\\.claude/worktrees|AGENTICOS_HOME" .
```

### Pass condition

- current path assumptions are enumerated
- standards references are known
- moved product-source references are known

### Rollback

- none; read-only verification gate

## 6. Step 3: Runtime Split Preparation

### Intended change

- prepare `.runtime/`
- ensure `.claude/worktrees/` is documented and ignored as runtime-only

### Pre-check

```bash
rg -n "\\.claude/worktrees|\\.runtime" .gitignore README.md AGENTS.md CLAUDE.md
```

### Post-check

```bash
git diff -- .gitignore README.md AGENTS.md CLAUDE.md
rg -n "\\.claude/worktrees|\\.runtime" .gitignore README.md AGENTS.md CLAUDE.md
```

### Pass condition

- runtime paths are ignored or documented correctly
- no product-source docs still frame worktrees as canonical source

### Rollback

```bash
git diff -- .gitignore README.md AGENTS.md CLAUDE.md
```

If incorrect, revert only those file changes in the migration branch/worktree.

## 7. Step 4: Standards Relocation

### Intended change

- move `projects/agentic-os-development/*` into `projects/agenticos/standards/`

### Pre-check

```bash
test -d projects/agentic-os-development
test ! -e projects/agenticos/standards
rg -n "projects/agentic-os-development" .
```

### Post-check

```bash
test -d projects/agenticos/standards
find projects/agenticos/standards -maxdepth 2 -mindepth 1 | sort
rg -n "projects/agentic-os-development" .
```

### Pass condition

- standards content exists at the new target path
- expected files are present
- old-path references are either gone or explicitly transitional

### Rollback

- revert standards move only
- rerun the same three post-check commands until the old state is restored cleanly

## 8. Step 5: Agent Command Asset Relocation

### Intended change

- move `.claude/commands/` into `projects/agenticos/.claude/commands/`

### Pre-check

```bash
test -d .claude/commands
find .claude/commands -maxdepth 2 -type f | sort
```

### Post-check

```bash
test -d projects/agenticos/.claude/commands
find projects/agenticos/.claude/commands -maxdepth 2 -type f | sort
test ! -d .claude/commands
```

### Pass condition

- command assets exist in the new product-project path
- runtime worktrees remain outside product-source semantics

### Rollback

- revert command asset relocation only

## 9. Step 6: Product-Source Directory Relocation

### Intended change

- move `mcp-server`, `homebrew-tap`, `.meta`, `.github`, and `tools` into `projects/agenticos`

### Pre-check

```bash
for p in mcp-server homebrew-tap .meta .github tools; do test -e "$p" || exit 1; done
```

### Post-check

```bash
for p in mcp-server homebrew-tap .meta .github tools; do test -e "projects/agenticos/$p" || exit 1; done
find projects/agenticos -maxdepth 2 -mindepth 1 | sort
```

### Pass condition

- all required product-source directories now exist under `projects/agenticos`

### Rollback

- revert directory relocation only
- rerun the post-checks against the original root layout

## 10. Step 7: Root Document Relocation and Rewrite

### Intended change

- move product docs into `projects/agenticos/`
- rewrite path references

### Pre-check

```bash
for f in README.md AGENTS.md CLAUDE.md CONTRIBUTING.md CHANGELOG.md ROADMAP.md LICENSE; do test -e "$f" || exit 1; done
```

### Post-check

```bash
for f in README.md AGENTS.md CLAUDE.md CONTRIBUTING.md CHANGELOG.md ROADMAP.md LICENSE; do test -e "projects/agenticos/$f" || exit 1; done
rg -n "projects/agentic-os-development|mcp-server/|homebrew-tap/|\\.meta/|\\.github/|tools/" projects/agenticos
```

### Pass condition

- moved docs exist in the product project
- rewritten references point at valid paths or are explicitly transitional

### Rollback

- revert doc moves and doc rewrites only

## 11. Step 8: Build Verification From New Product Path

### Commands

```bash
cd /path/to/AgenticOS/projects/agenticos/mcp-server
npm install
npm run build
```

### Pass condition

- product implementation still builds from the relocated product-project path

### If fail

- stop immediately
- revert the most recent relocation or rewrite step

## 12. Step 9: Workspace Root Verification

### Commands

```bash
cd /path/to/AgenticOS
find projects -maxdepth 1 -mindepth 1 | sort
find .runtime -maxdepth 2 -mindepth 1 | sort
rg -n "workspace home|AGENTICOS_HOME|projects/agenticos|projects/agenticos/standards" .
```

### Pass condition

- root now reads as workspace home
- managed projects remain visible
- runtime root exists and is semantically separate

## 13. Stop Conditions

Stop immediately if:
- build verification fails
- moved paths are missing after a relocation step
- stale references cannot be reconciled within the current step
- unrelated repository changes make verification ambiguous

## 14. Immediate Next Action

Before any real migration starts, produce one more artifact:
- a step-by-step move script or operator checklist tied exactly to this playbook
