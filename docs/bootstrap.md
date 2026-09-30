# Naima tracking itself

Naima tracks itself, in `naima-tracker/naima-data/`. If the code in the
working tree managed that tracker, a bug in the checker could hide a bug on
the board, and a change to the item format could make the tracker's own
history unreadable. So the working tree never manages it. There is no special
case for this: Naima's repository uses exactly the model every project uses
([installing and updating](install.md)).

1. **The tracker is managed by the locked commit.** `naima-tracker/naima/` is
   a gitignored clone of Naima itself, locked to a commit of its own `main` by
   `naima.json`; that commit is the "previous version". `deno task naima
   <command>` runs it, through the launcher. Alignment clones it from this
   repository's own objects, so it needs no network.
2. **The working tree is tested against the tracker, never its authority.**
   `deno task dev <command>` runs the working tree on the same data, and
   `deno task verify` runs `check` with both: the working tree as a test, the
   lock as the authority. The working tree never writes the tracker.
3. **The lock moves after the change is on `main`.** Once a change is merged,
   verified and pushed, `naima update` moves the lock to the new `main`, as
   one commit. A change the tracker is about to use — a new type, field,
   status or directory — is used only after that update.

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

## History

Until the Deno distribution, the tracker lived in a top-level `naima/`
directory, and a version pin in `naima/config.json` chose the newest tagged
release (`v0.1.0`, `v0.2.0`) to manage it. The tags remain as history; no
tool reads them. The tracker moved to `naima-tracker/naima-data/` by hand,
with `git mv`, because the old layout had no anchor carrying a format to
migrate from ([migrations](format.md#migrations)).
