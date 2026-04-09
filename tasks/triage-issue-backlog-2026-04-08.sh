#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/Users/jeking/dev/AgenticOS/projects/agenticos"
DRY_RUN="${DRY_RUN:-1}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[dry-run] %q' "$1"
    shift
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
  else
    "$@"
  fi
}

write_body() {
  local issue="$1"
  local path="$TMP_DIR/$issue.md"
  cat >"$path"
}

comment_from_file() {
  local issue="$1"
  local path="$TMP_DIR/$issue.md"
  run gh issue comment "$issue" --body-file "$path"
}

write_body 181 <<'EOF'
As of 2026-04-08, this looks substantially complete. agenticos_init now requires explicit topology, and project resolution/switch paths fail closed for non-normalized projects. I'm moving this to close-review unless we find a remaining gap that is not already covered by the current registry/topology cleanup follow-up.
EOF

write_body 189 <<'EOF'
As of 2026-04-08, the decision-rubric part of this issue appears landed. The topology decision rubric and local-to-GitHub upgrade path are already documented. I'm moving this to close-review unless there is a remaining executable gap beyond documentation alignment.
EOF

write_body 191 <<'EOF'
As of 2026-04-08, this looks substantially complete. The distinction between local workflow topology and canonical source inclusion is already defined in current policy docs. I'm moving this to close-review unless we find a remaining implementation gap that is not already part of the registry/topology-truth work.
EOF

write_body 214 <<'EOF'
As of 2026-04-08, the requested runtime recovery audit exists and is executable. I'm moving this to close-review. Any remaining work now looks like follow-up on audit results, not absence of the audit surface itself.
EOF

write_body 218 <<'EOF'
As of 2026-04-08, bootstrap already requires explicit workspace confirmation rather than silent auto-selection. I'm moving this to close-review. If any edge case remains, it should be filed as a narrower bootstrap regression.
EOF

write_body 220 <<'EOF'
As of 2026-04-08, the root-git exit audit exists and is executable. I'm moving this to close-review. Remaining work should follow from the audit result, not from the absence of the audit itself.
EOF

write_body 169 <<'EOF'
I recommend treating this as a superseded umbrella rather than an active execution issue.

Current judgment as of 2026-04-08:
- the original dirty-tree problem has already been split into narrower follow-ups
- the live repo is no longer in the state described by this issue
- keeping this open in its current form creates scope churn

Suggested action:
- mark as superseded umbrella
- point any still-live work to narrower normalization / release / bootstrap issues
EOF

write_body 187 <<'EOF'
As of 2026-04-08, this no longer looks like a primary blocker. I'm moving it to close-review / possible superseded status unless we can point to a currently reproducible helper-root dirtiness problem in the live workspace.
EOF

write_body 222 <<'EOF'
As of 2026-04-08, this issue appears superseded by the current state: the root-git exit audit already passes, so the original blocker framing is no longer current. I recommend closing this as superseded and carrying any remaining "project truth / registry truth" work under the narrower normalization issue.
EOF

write_body 224 <<'EOF'
As of 2026-04-08, this issue appears superseded by the current state: the root-git exit audit already passes, so the original blocker framing is no longer current. I recommend closing this as superseded and carrying any remaining workspace-metadata truth work under the narrower normalization issue.
EOF

write_body 145 <<'EOF'
I recommend merging the intent of this issue into one bootstrap/session-start hardening track.

Current judgment as of 2026-04-08:
- the problem is real
- the mechanism in the original issue is stale
- the remaining gap is broader than one doc tweak

The rewritten scope should be:
- session-start project alignment is explicit and required
- adapter/bootstrap surfaces express one canonical guardrail flow
- runtime-specific hook guidance is aligned with the installed-runtime contract
- any conformance check validates the same sequence

I do not recommend continuing this as a standalone narrow hook/doc issue.
EOF

cp "$TMP_DIR/145.md" "$TMP_DIR/146.md"

write_body 149 <<'EOF'
I recommend batching this with the adjacent agenticos_record hardening work.

Current judgment as of 2026-04-08:
- this is still valid
- it is implementation-ready
- it touches the same file, tests, and output surface as the neighboring record issue

Suggested execution model:
- merge into one "record surface hardening" slice
- implement guardrail summary + delegation validation together
EOF

cp "$TMP_DIR/149.md" "$TMP_DIR/151.md"

write_body 164 <<'EOF'
I recommend rewriting this issue around the existing agenticos_issue_bootstrap boundary instead of introducing a parallel new guardrail concept.

Current judgment as of 2026-04-08:
- the early intake/alignment problem is real
- but the product already has an issue-intake surface
- the remaining work is to tighten and canonicalize that surface, not to invent another one

Suggested rewrite:
"Tighten agenticos_issue_bootstrap as the canonical fail-closed issue-intake boundary."
EOF

write_body 147 <<'EOF'
I recommend reframing this as a support-tier decision first.

Current judgment as of 2026-04-08:
- this comes from a real RCA
- but adding Agent-CLI-API directly to the official adapter matrix widens the supported surface
- that product decision should be explicit before matrix changes land

Suggested rewrite:
"Decide Agent-CLI-API support tier before adapter-matrix inclusion."
EOF

write_body 175 <<'EOF'
I recommend merging this issue into one narrower active theme: workspace registry and topology truth repair.

Current judgment as of 2026-04-08:
- the high-level workspace/product-source model is already decided
- root-git exit is no longer the main unresolved architecture problem
- the remaining gap is truth alignment between registry state, .project.yaml, topology metadata, and actual project layout

I do not recommend continuing this as a separate migration-era slice. The live work should focus on:
- registry truth
- project metadata truth
- source binding truth
- removal of stale self-hosting assumptions
EOF

cp "$TMP_DIR/175.md" "$TMP_DIR/177.md"
cp "$TMP_DIR/175.md" "$TMP_DIR/178.md"
cp "$TMP_DIR/175.md" "$TMP_DIR/193.md"
cp "$TMP_DIR/175.md" "$TMP_DIR/197.md"
cp "$TMP_DIR/175.md" "$TMP_DIR/198.md"
cp "$TMP_DIR/175.md" "$TMP_DIR/211.md"

write_body 215 <<'EOF'
Keeping this open as an active execution issue.

Reason as of 2026-04-08:
- source version is already 0.4.1
- changelog reflects 0.4.1
- Homebrew formula still points to 0.4.0
- runtime recovery is still blocked by installed-runtime parity

This is a real current blocker, not backlog residue.
EOF

write_body 154 <<'EOF'
I recommend reframing or partially closing this rather than continuing with the original issue body.

Reason as of 2026-04-08:
- substantial README Agent-Friendly work already exists
- the remaining gap looks more like adoption/compliance refinement than greenfield spec work
EOF

write_body 161 <<'EOF'
I recommend deferring this out of the AgenticOS core backlog.

Reason as of 2026-04-08:
- this is downstream 360Teams migration work
- it is not the current AgenticOS bottleneck
- keeping it in the core queue dilutes focus from bootstrap/runtime/topology truth work
EOF

write_body 173 <<'EOF'
I recommend deferring this for now.

Reason as of 2026-04-08:
- the direction is valid
- but it is not the current shipping bottleneck
- broad Agent-Friendly foundations work should not displace runtime/bootstrap/topology closure work
EOF

write_body 174 <<'EOF'
I recommend deferring this for now.

Reason as of 2026-04-08:
- this is broad platform/code-standard work
- it depends on a broader Agent-Friendly foundation
- it is not the current product bottleneck
EOF

cd "$REPO_DIR"

echo "Repo: $REPO_DIR"
echo "DRY_RUN=$DRY_RUN"

for issue in \
  181 189 191 214 218 220 \
  169 187 222 224 \
  145 146 149 151 164 147 \
  175 177 178 193 197 198 211 \
  215 \
  154 161 173 174
do
  comment_from_file "$issue"
done
