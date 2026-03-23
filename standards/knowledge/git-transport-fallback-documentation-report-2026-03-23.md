# Git Transport Fallback Documentation Report - 2026-03-23

## Summary

Issue `#58` was completed in the main `AgenticOS` product repository to document a canonical operator procedure for GitHub publication failures caused by broken Git proxy and credential plumbing.

The landed documentation replaced the earlier unsafe guidance that embedded tokens directly in remote URLs.

## Landed Changes

Merged PR:

- `#59` `docs: document git transport fallback (#58)`

Closed issue:

- `#58` `docs: document GitHub transport fallback when Git proxy and credential plumbing break`

Main repository docs now:

- diagnose GitHub publication failures before changing global config
- check `gh auth status`
- inspect global `http.proxy` / `https.proxy`
- verify direct Git reachability with command-scoped `-c http.proxy= -c https.proxy=`
- use a temporary `GIT_ASKPASS` helper for non-interactive HTTPS push
- explicitly avoid embedding tokens in remote URLs

Files changed in the product repository:

- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`

## Verification

Verified outcomes:

- branch `docs/58-git-transport-fallback` pushed successfully
- PR `#59` merged successfully
- issue `#58` closed automatically through `Closes #58`

## New Follow-Up

During publication of PR `#59`, one more compatibility nuance appeared:

- `git -c http.proxy= -c https.proxy= ls-remote ...` succeeded immediately
- `git push` with only no-proxy + `GIT_ASKPASS` still failed once with:
  - `LibreSSL SSL_connect: SSL_ERROR_SYSCALL`
- adding command-scoped `-c http.version=HTTP/1.1` allowed the push to succeed

This means the newly landed documentation is directionally correct but still incomplete for this machine's exact transport behavior.

To capture that residual gap, issue `#60` was opened:

- `docs: refine GitHub transport fallback with HTTP/1.1 compatibility note`

## Conclusion

The repository now has a canonical and much safer GitHub transport fallback procedure than before, but there is still one machine-specific transport compatibility refinement to document.
