# A command started by naima run inherits NAIMA_LAUNCHED, so a Naima it starts believes it was launched and fails

## What happens

`naima run t1 --budget-time 20m -- 'deno task test > out.txt'`, from the
workshop through the launcher, ran the suite with 8 failures; the same suite
run from a shell has none of them. The launcher hands `naima run` the whole
environment plus `NAIMA_LAUNCHED=1` (src/launcher.ts, `wholeEnv`), and the
run's command inherits both: every Naima the command starts — here the tests'
own CLI runs (test/core/epipe.test.ts, test/core/core.test.ts, the remote run
of test/plugins/long-work/long-work.test.ts) — believes the launcher started
it, skips its own launch and fails (exit 75, or an alignment fetch from
`example.invalid`, exit 2). Reproduced alone: `NAIMA_LAUNCHED=1 deno test -A
test/core/epipe.test.ts` fails; without the variable it passes.

## Expected

A run's command gets the caller's environment, as the specification of long
work says, without Naima's own launch markers (`NAIMA_LAUNCHED`, and
`NAIMA_DATA` unless the caller set it).

## Workaround

`env -u NAIMA_LAUNCHED <command>` as the run's command.
