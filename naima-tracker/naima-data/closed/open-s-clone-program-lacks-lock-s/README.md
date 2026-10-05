# open's clone of the program lacks the lock's ref, so a run in the new worktree is refused when the seed's main lags the lock

## What happens

`naima open` clones the program into the new worktree from the local clone.
The clone's remote-tracking refs are the seed's local branches; when the
seed's own `main` lags the locked commit (as it does after `naima update`),
the new clone's HEAD is on no remote-tracking ref and every run in the new
worktree stops with "has commits its source does not have". Seen on the
first `naima open` of five worktrees in a project, and in `deno task verify`
of the worktree the fix was made in.

## Cause

`cloneIntoNewWorktree` fetched the lock's ref from the seed only when the
commit was missing; `cloneProgram` always fetches it, and that ref is what
makes the commit count as the source's.
