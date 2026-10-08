# Five tests fail under a full deno task verify run and pass alone

Under a full `deno task verify` (6m42s, 2026-10-08, branch claude/links-commonmark), five tests
failed that pass when their files run alone, on the branch and on the trunk alike (55 passed, 0
failed, 14s): `new never reuses a directory` (test/core/core.test.ts), the three `piping naima's
output into a reader that closes early` cases (test/core/epipe.test.ts, deno, node, bun), and `a
remote run is one ssh call to the host's own Naima` (test/plugins/long-work/long-work.test.ts).

Measured: the failures under the full suite, the passes in isolation. Inferred, not checked:
timing or process contention under load. Consequence: `deno task verify` is red on a branch whose
change is unrelated, so every hand-over has to prove the red is not its own.
