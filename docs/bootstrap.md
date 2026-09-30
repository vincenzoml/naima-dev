# Bootstrap policy

Naima tracks itself, in `naima/`. If the code in the working tree managed
that tracker, a bug in the checker could hide a bug on the board, and a change
to the item format could make the tracker's own history unreadable. So:

1. **The tracker is managed by the previous stable release**, chosen by the
   pin. `npm run naima -- <command>` runs it.
2. **The development build is tested against the tracker, never its
   authority.** `npm run naima:dev -- <command>` runs the working tree, and
   `npm run verify` runs `check` with both: the development build as a test,
   the stable as the authority.
3. **A format change ships in a stable before the development version writes
   it.** A new type, field, status or directory the tracker is about to use:
   tag a stable that knows it, bump the pin, then use it.

## The mechanism: the pin

This is not a special case. Naima's repository is a Naima project like any
other ([using Naima in your project](using-naima.md#the-pin)), and its pin is
`naima` in [`naima/config.json`](../naima/config.json): a semver range. Two
things follow from it.

- **Which stable manages the tracker.** [`scripts/stable.mjs`](../scripts/stable.mjs)
  picks the newest `v*` tag inside the pin (fetching tags from `origin` when
  none is here), extracts that commit's `src/` and `package.json` with
  `git archive` into the user's cache directory — `~/Library/Caches/naima`,
  `$XDG_CACHE_HOME/naima` or `~/.cache/naima`, `%LOCALAPPDATA%\naima`, or
  `$NAIMA_CACHE` — and runs its CLI with node from the current directory.
  Naima has no runtime dependencies and node runs its TypeScript directly, so
  the extracted tree is complete as it is. The cache is named by commit: a tag
  that moves gets a new directory. Nothing is written into the repository.
- **Which builds may act at all.** Every Naima checks its own version against
  the pin and refuses, in one line, when it is outside. The working tree
  carries the version of the release it is working towards only from the
  moment that release is tagged, so between releases it stays inside the pin
  like the stable.

```sh
npm run naima -- check          # the stable, on this tracker
npm run naima:dev -- check      # the working tree, on the same tracker
npm run stable:which            # the pin, the tag it resolves to, its commit, its cache directory
```

## Bumping the pin

When the trunk holds a version that should manage the tracker:

```sh
npm run verify                          # the trunk is green
# set package.json's version to 0.3.0, commit
git tag -a v0.3.0 -m "Naima 0.3.0"
npm run stable:bump -- v0.3.0           # pins ^0.3.0 after the new tag passes check here
git commit -am "Pin the tracker to v0.3.0"
git push origin main v0.3.0
```

`stable:bump` refuses, and leaves the pin where it was, when the new tag does
not pass `check` on the tracker as it stands.

A release that changes the layout itself (v0.2.0 moved `tracker/` and
`naima.config.json` into `naima/`) cannot be checked by the stable before it,
which does not know the new layout. That release is tagged on the commit that
moves the tracker and carries its own pin; from then on the rule above holds.

## Why the reference is checked by the development build

`docs/reference.md` documents the working tree's plugins, which the stable
does not have. So `npm run verify` runs `naima docs --check docs/reference.md`
through the development build, and the `docs` plugin holds no reference file
of its own by default.
