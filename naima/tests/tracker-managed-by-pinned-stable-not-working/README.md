# The tracker is managed by the pinned stable, not the working tree

## Gesture

In a fresh clone:

1. `npm run stable:which` — prints the pin in `naima/config.json`, the
   newest tag inside it, and the commit that tag names. (Until v0.2.0 the pin
   was `naimaStable` in `package.json`.)
2. Change the usage line in `src/core/cli.ts`; run `npm run naima -- help`.
   It must print the original usage; `npm run naima:dev -- help` prints the
   changed one.
3. `npm run stable:bump -- <a tag that fails check>` exits non-zero and
   leaves the pin unchanged.

Pass: all three hold. `src/stable.test.ts` automates 2 and 3 in a throwaway
repository; this item is the check that it holds on the real one.

## Result

Not yet performed by someone other than the author.
