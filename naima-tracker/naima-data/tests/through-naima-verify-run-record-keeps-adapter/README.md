# Through naima verify the run record keeps the adapter's details; details that are not an object are an error, and a record holding them is not trusted (test/plugins/verifier-mcrl2/lts-route.test.ts and test/plugins/verifier/verifier.test.ts, on Deno, Node and Bun)

The gesture that proves it, step by step, and what a pass looks like.

## Result

What was seen, when, and by whom.

## Notes

### 2026-10-10 — Vincenzo Ciancia, on agent/lts-route

Passed: product commit 6bca9a8 on branch agent/lts-route, macOS arm64, mCRL2 202607.0 installed: deno task verify green (typecheck, lint, fmt, tests, check, reference), node --test green, bun test 465/465. Tests: the naima verify details test and the verifier details test.
