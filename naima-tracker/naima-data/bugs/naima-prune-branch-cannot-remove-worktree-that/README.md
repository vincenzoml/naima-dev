# naima prune --branch cannot remove a worktree that holds a submodule: git refuses, and the worktree and branch stay

On 2026-10-08, after the branch claude/links-commonmark was fast-forwarded into main, `naima prune --branch claude/links-commonmark --write` stopped with git's own refusal: working trees containing submodules cannot be moved or removed. The workshop's worktrees all hold the submodule `naima/`, so none can be pruned by the command the closing flow names; the dry run promised to remove it.

Measured: the refusal, from the main checkout, on a clean, merged worktree. Not tried: `git worktree remove --force`, which git documents for this case, nor deinitialising the submodule first.

Consequence: finished worktrees and their branches accumulate in naima-worktrees/ (five were there already), and every stale branch keeps its claims alive in `naima claims`.
