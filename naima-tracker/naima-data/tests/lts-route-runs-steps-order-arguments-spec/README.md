# The LTS route runs its steps in order with the arguments the spec names; false is confirmed and explained on the unreduced LTS; live, the real tools agree with the standard route (test/plugins/verifier-mcrl2/lts-route.test.ts, on Deno, Node and Bun)

The gesture that proves it, step by step, and what a pass looks like.

## Result

What was seen, when, and by whom.

## Notes

### 2026-10-10 — Vincenzo Ciancia, on agent/lts-route

Passed: product commit 6bca9a8 on branch agent/lts-route, macOS arm64, mCRL2 202607.0 installed: deno task verify green (typecheck, lint, fmt, tests, check, reference), node --test green, bun test 465/465. Tests: the steps-and-details test, the false-confirmed test, and the live cross-check on the switch fixture (true, true, false), which ran here against the real tools.
