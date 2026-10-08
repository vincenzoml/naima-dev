# An agent toolset for long work, made mandatory

## The owner's words, restated (2026-10-07/08)

Agents improvise how to wait, and get it wrong. Naima should offer a toolset
for tasks such as waiting, and its use should be mandatory for those tasks.

## What went wrong (VoxLogicA-2-clean, 2026-10-07)

An agent waited for benchmark runs with
`until ! pgrep -f "naima.ts metrics"; do sleep 30; done`. The pattern is in
the loop's own command line, so it matched itself and never ended: 13 such
loops ran for up to 10.5 h, shown to the owner as "tasks running". Other
loops polled a remote progress file over ssh every 300 s for hours after the
run had hung. A third agent filled a remote disk to 100% with stores it did
not clean.

## Proposal (specify first)

- `naima run <name> [--host <h>] -- <cmd>`: start a long command detached,
  locally or on a declared host, with a log, a progress file, a pid record,
  a time budget and a disk budget; it ends itself when the budget runs out.
- `naima wait <name|pid> [--timeout]`: blocks until the run ends (by pid or
  remote pid, never by pattern), then prints its exit status and log tail —
  one command, so the agent's harness notices completion.
- `naima runs`: what is running, where, for how long, against its budget;
  stale runs flagged.
- `naima run clean <name>`: removes what a run created (stores, temp dirs) on
  its host.
- A rule shipped with Naima, active for agents: long work goes through
  `naima run`/`naima wait`; hand-written wait loops (`until`/`while` +
  `sleep`, `pgrep -f`) are forbidden; `naima check` can flag them in session
  notes or scripts committed to the repository.

Related: the decision that Naima installs tools portably (a host is where
Naima runs), and the metrics tiers (fmt-5000 only).

## Notes

### 2026-10-08 — Claude, on agent/agent-runs, on agent/agent-runs

Implemented on agent/agent-runs (product commits 582c985, f75e57b): plugin long-work (naima run, wait, run list/status/stop/clean), the rules plugin's shipped-rules point and retire option, the launcher's grant for run and wait. 431/431 tests on Deno, Node and Bun (macOS). Left: merge to the product's main and the lock update (then status=shipped); the Windows and Linux runs owed by tests/platform-choices-win32-darwin-linux-suite-macos.
