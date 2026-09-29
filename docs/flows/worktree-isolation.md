# Worktree isolation

A system requirement, not a preference: every other flow is written to obey
it, and a procedure that violates it is a defect in the procedure.

## The five rules

### 1. A worktree writes to its own branch and nowhere else

No tool, flow or session writes into another checkout or commits onto a
branch it is not standing on. **Reading** other branches is fine, and is how
every shared view is built.

### 2. Nobody commits on the trunk while branches are being prepared

A commit on the trunk while a branch is being prepared destroys that branch's
fast-forward: what was a clean fast-forward becomes a merge over everything
the branch touched. Work in hand goes on a branch:

```sh
git worktree add -b <who>/<what> <worktrees-dir>/<what>
```

If it happens anyway, move the commit onto the branch and rewind the trunk,
so that git proves the result instead of a merge papering over it:

```sh
git -C <worktree> cherry-pick <sha>     # the commit joins the branch
git reset --keep <sha>^                 # the trunk goes back one; --keep, never --hard
git merge --ff-only <branch>
```

Whether a project allows direct commits on the trunk at all is the owner's
call; this rule is about not doing it under a branch being prepared.

### 3. Every merge to the trunk is a fast-forward

```sh
git merge --ff-only <branch>
```

**If it fails, stop.** Do not resolve on the trunk, do not `--no-ff`, do not
force. The failure is information: the trunk moved under a branch prepared
against it, and why it moved decides what to do — usually, merge the trunk
into the branch and resolve there (step 6 of
[closing a worktree](closing-a-worktree.md)).

Why: a merge commit hides whether the branch was prepared. `--ff-only`
cannot — it either passes, and the branch was ready, or it refuses before
writing anything. A prepared branch needs nothing but the fast-forward; if it
needs more, the resolution belongs on the branch, where whoever wrote the code
is standing.

### 4. No shared mutable file

Nothing asks two sessions to edit one path to register, announce or log
something: no registry, index, board or "who is doing what" file.

Where a collection is needed: **one file per session, named by a uuid, in a
directory — and the collection is recombined when read.** Naima does this for
its own state:

| Collection | What each session writes | Recombined by |
|---|---|---|
| who is working on what | `<tracker>/CLAIMS/<uuid>.json` | `naima claims`, `naima summary` |
| where each session left off | `<tracker>/PASSES/<date>-<uuid>.md` | `naima pass --list`, `naima summary` |
| an item's place on a board | the item's own `section` field | `naima board` |

The views read the trunk, every branch not merged into it, and whatever each
worktree is standing on, uncommitted files included.

### 5. The smell

> You are about to append a line to a file another session also appends to.

Stop. Make it a directory of uuid-named files.

## What is still allowed

- **Reading any branch.** That is how the views work.
- **Several branches claiming one item.** `naima claim` says who else holds
  it rather than refusing: the point is to know, not to lock.
