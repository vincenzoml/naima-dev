# Bootstrap policy

Naima tracks itself, in `tracker/`. If the code in the working tree managed
that tracker, a bug in the checker could hide a bug on the board, and a change
to the item format could make the tracker's own history unreadable. So:

1. **The tracker is managed by the previous stable release**, pinned by git
   tag. `npm run naima -- <command>` runs it.
2. **The development build is tested against the tracker, never its
   authority.** `npm run naima:dev -- <command>` runs the working tree, and
   `npm run verify` runs `check` with both: the development build as a test,
   the stable as the authority.
3. **A format change ships in a stable before the development version writes
   it.** A new plugin in `naima.config.json`, a new type, field or status the
   tracker is about to use: tag a stable that knows it, bump the pin, then use
   it.

## The mechanism

The pin is `naimaStable` in `package.json`, a git tag.
[`scripts/stable.mjs`](../scripts/stable.mjs) resolves the tag to its commit,
extracts that commit's `src/` and `package.json` with `git archive` into
`.naima/stable/<tag>-<commit>/` (ignored by git), and runs its CLI with node
from the project root. Naima has no runtime dependencies and node runs its
TypeScript directly, so the extracted tree is complete as it is. The cache is
named by commit: a tag that moves gets a new directory. A tag missing locally
is fetched from `origin`.

```sh
npm run naima -- check          # the stable, on this tracker
npm run naima:dev -- check      # the working tree, on the same tracker
npm run stable:which            # the pin, its commit, its cache directory
```

## Bumping the pin

When the trunk holds a version that should manage the tracker:

```sh
npm run verify                          # the trunk is green
git tag -a v0.2.0 -m "Naima 0.2.0"      # with package.json's version bumped to match
npm run stable:bump -- v0.2.0           # runs the new tag's check on the tracker first
git commit -am "Pin the tracker to v0.2.0"
git push origin main v0.2.0
```

`stable:bump` refuses, and leaves the pin where it was, when the new tag does
not pass `check` on the tracker as it stands.

## Why the reference is checked by the development build

`docs/reference.md` documents the working tree's plugins, which the stable
does not have. So `naima.config.json` leaves the `docs` plugin's `reference`
option unset here, and `npm run verify` runs `naima docs --check
docs/reference.md` through the development build instead. A project that uses
a released Naima has no such split, and sets `reference` so that `naima check`
itself holds it.
