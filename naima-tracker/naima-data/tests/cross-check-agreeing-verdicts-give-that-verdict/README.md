# Cross-check: agreeing verdicts give that verdict with the standard route's counterexample; disagreement is an error; a missing verdict on either side gives none (test/plugins/verifier-mcrl2/lts-route.test.ts, on Deno, Node and Bun)

The gesture that proves it, step by step, and what a pass looks like.

## Result

What was seen, when, and by whom.

## Notes

### 2026-10-10 — Vincenzo Ciancia, on agent/lts-route

Passed: product commit 6bca9a8 on branch agent/lts-route, macOS arm64, mCRL2 202607.0 installed: deno task verify green (typecheck, lint, fmt, tests, check, reference), node --test green, bun test 465/465. Tests: the cross-check test, and the live one.
