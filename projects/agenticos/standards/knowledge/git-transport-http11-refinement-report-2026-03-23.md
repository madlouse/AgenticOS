# Git Transport HTTP/1.1 Refinement Report - 2026-03-23

## Summary

Issue `#60` completed the follow-up refinement that remained after the initial GitHub transport fallback documentation landed in issue `#58`.

The main gap was that the first documented fallback still was not sufficient for this machine's exact Git HTTPS behavior. During publication of PR `#59`, the push only succeeded after adding command-scoped `-c http.version=HTTP/1.1`.

## Landed Changes

Merged PR:

- `#61` `docs: refine git transport fallback (#60)`

Closed issue:

- `#60` `docs: refine GitHub transport fallback with HTTP/1.1 compatibility note`

Repository docs now explicitly distinguish:

- proxy-path failures
- credential-path failures
- Git HTTPS transport-compatibility failures

The documented operator sequence now includes:

1. verify GitHub reachability and auth state
2. retry with command-scoped `-c http.proxy= -c https.proxy=`
3. supply credentials with temporary `GIT_ASKPASS`
4. if push still fails with `LibreSSL SSL_connect: SSL_ERROR_SYSCALL`, retry with:
   - `-c http.version=HTTP/1.1`

## Files Updated In Product Repository

- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`

## Verification

Verified outcomes:

- branch `docs/60-git-transport-http11` pushed successfully with the documented `HTTP/1.1` compatibility override
- CI passed for PR `#61`
- PR `#61` merged successfully
- issue `#60` closed automatically through `Closes #60`

## Conclusion

The GitHub transport fallback is now documented at the level actually required by this machine's observed behavior. Future agents should no longer stop at the earlier no-proxy + `GIT_ASKPASS` step if the remaining failure is really a Git HTTPS transport compatibility issue.
