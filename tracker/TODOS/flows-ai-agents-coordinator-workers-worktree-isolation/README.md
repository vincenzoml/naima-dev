# Flows for AI agents: coordinator and workers, worktree isolation, ff-only merges

The written procedures an agent follows, shipped with Naima so any project
that adopts it gets them:

- **worktree isolation** — a worktree writes to its own branch and nowhere
  else; no tool commits on a branch it is not standing on; no shared mutable
  file (a registry becomes a directory of files named by uuid).
- **every merge to the trunk is `--ff-only`** — if it fails, stop and ask; the
  resolution belongs on the branch.
- **coordinator and workers** — one coordinator talks to the person, merges
  and keeps the queue honest; every piece of work runs in a worker with its
  own worktree, a filed item, and the gates to pass.
- **opening and closing a worktree** — claim, work, name the gesture that
  proves each fix, triage what is left, release claims, write the session
  note, merge the trunk into the branch, fast-forward.
- **reporting and triage** — write it down before fixing it; four triage
  fields; effort is never guessed.

- [ ] write each flow as one page in `docs/flows/`
- [ ] ship them as agent commands (harness-neutral where possible)
- [ ] a check that the flows named in agent instructions exist
