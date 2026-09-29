# Bootstrap policy: the development version is managed by the previous pinned stable version

Naima tracks itself. Today the tracker is read by the code in the same
working tree (`npm run naima`), so a bug in the checker can hide a bug on the
board, and a change to the item format can make its own history unreadable.

The policy to decide and write down:

- the tracker is managed by the previous stable release, pinned by version in
  `devDependencies`, not by the working tree;
- the working tree's own build runs against the tracker as a test, never as
  the authority;
- a format change ships with the stable release that can read it before the
  development version is allowed to write it.

- [ ] decide the pin mechanism (npm version, git tag, or vendored build)
- [ ] switch `npm run naima` to the pinned version once one exists
