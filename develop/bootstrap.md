# Naima tracking itself

Naima tracks itself, in `naima-tracker/naima-data/`. If the code in the
working tree managed that tracker, a bug in the checker could hide a bug on
the board, and a change to the item format could make the tracker's own
history unreadable. So the working tree never manages it. There is no special
case for this: Naima's repository uses exactly the model every project uses
([installing and updating](../naima/docs/guide/install.md)).

1. **The tracker is managed by the locked commit.** `naima-tracker/naima/` is
   the stable clone: a gitignored git clone of the product,
   `github.com/vincenzoml/naima`, locked by `naima.json` to a commit of its
   `main`, exactly as a project's program is
   ([the program](../naima/docs/reference/format.md#the-program)); that commit
   is the "previous version". `deno task naima <command>` runs it, through
   its own launcher, `naima-tracker/naima/naima.ts`; `deno task dev` runs the
   submodule `naima/` and names the data with `--data`, since a program finds
   its data beside itself. A missing stable clone is restored with `git clone
   https://github.com/vincenzoml/naima.git naima-tracker/naima` and any
   `deno task naima` command, which aligns it to the lock.
2. **The working tree is tested against the tracker, never its authority.**
   `deno task dev <command>` runs the working tree on the same data, and
   `deno task verify` runs `check` with both: the working tree as a test, the
   lock as the authority. The working tree never writes the tracker.
3. **The lock moves after the change is on `main`.** Once a change is merged,
   verified and pushed, `naima update` moves the lock to the new `main`, as
   one commit. A change the tracker is about to use — a new type, field,
   status or directory — is used only after that update.

This repository, `naima-dev`, is the workshop. The product is its submodule
`naima/`, `github.com/vincenzoml/naima`: what a project clones, and nothing
else. The development files — `test/`, `develop/`, `AGENTS.md`, `.claude/`,
`deno.json`, `scripts/`, `site/`, and this tracker — are here
only, outside the product, so `deno task naima` cannot read Naima's own items
from inside its program directory by accident.

A change to Naima is two commits, in order. In `naima/`, on a branch of the
same name as the workshop branch: commit, merge into the product's `main`,
push. Then, here, commit the new submodule pointer. A workshop commit never
points at a product commit that is not on the product's `main`. A worktree of
the workshop gets its submodule without the network: `git submodule update
--init --reference <main worktree>/naima`. The stable clone moves as every
project's program does: once the change is on the product's `main`, `deno
task naima update`, committed here as one change.

The site is built here, from `site/`, and pushed by hand with
`sh scripts/publish-site.sh` (the owner's own git credentials; no CI, secret
or deploy key) as a fast-forward commit on the product's branch `gh-pages`,
which the product's Pages serves. It publishes only for the branch holding
the `site` resource (`deno task naima claim --resource site`), refusing
otherwise and naming the holder, and writes that claim into the gh-pages
commit as `Resource-Claim: site <claim id> <branch>`; `deno run -A
scripts/site-claims.ts audit <git-dir> <rev>` flags every publish commit since
the first one carrying a claim that lacks it, and the script runs it on every
publish.

```sh
deno task naima check        # the locked commit, on this tracker
deno task dev check          # the working tree, on the same tracker
deno task naima update --check
```

## Why the reference is checked by the working tree

`docs/reference.md` documents the working tree's plugins, which the locked
commit may not have yet, and the launcher lets Naima write only under
`naima-tracker/`. So `deno task docs` writes the reference and `deno task
verify` checks it, both with the working tree, and the `docs` plugin holds no
reference file of its own by default.
