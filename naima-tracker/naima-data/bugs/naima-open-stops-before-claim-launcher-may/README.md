# naima open stops before the claim: the launcher may not read the worktree it has just made

`naima open <item> --as <who> --name <what>` makes the worktree and the branch,
then exits 2 with `Requires read access to "<worktrees>/<what>/naima-tracker/naima",
run again with the --allow-read flag`: no program clone in the new worktree and
no claim. The worktree is left without a claim, which the check worktree-policy
fails, and `deno task naima` cannot run in it at all.

Cause: the launcher grants read access to the worktrees that exist when it
starts; the one `open` has just made is not among them, and `open` clones the
program into it through `align`, which reads the target directly. The claim
itself is already written through git for exactly this reason.

## Evidence

Seen on 2026-10-05 opening claude/dag-diary-help in this workshop.
