# Progress: long work says how far it is

The behaviour, said so that it can be checked: what goes in, what comes out,
and the cases at the edges. The feature it specifies is
features/long-work-reports-progress-done-total-rate; it extends the long-work
plugin (specs/long-work-naima-run-wait-run-list) and the commands of Naima
that can run long.

## 0. The problem

On the VoxLogicA-2 scheduler model, `pbessolve` ran for more than 11 hours on
each of two properties, at 10 to 70 BES equations per second
(specs/verifier-mcrl2-lts-route-cross-check, §0). Nothing showed whether it
was moving, how fast, or when it would end: a silent run cannot be told apart
from a hung one, and the only choice left is to wait blind or to kill work
that was nearly done. `naima run` already gave a command a progress file, but
nothing said what to write in it, nothing read a rate or an ETA from it, and
Naima's own long commands wrote nothing.

## 1. The rule

Shipped by the long-work plugin, active wherever it is loaded, for everyone:

- **name** `long-work-reports-progress`, **strength** must, **audience**
  everyone, **ack** "Progress mode on", **enforced by** the check
  `progress-declared` (§7).
- **Text:** work that can last more than a few seconds reports its progress
  at least every few seconds: how much is done of the total (or the stage it
  is in, with a count), and an estimate of the time left whenever the total
  is known. Where that is truly impossible — a tool with no progress
  interface — the work declares so, with the reason, and reports what it can:
  the elapsed time, the stage, and the tool's own log lines. A run started
  with `naima run` writes its progress to `$NAIMA_RUN_PROGRESS`, or is started
  with `--no-progress "<reason>"`.

## 2. The progress line

A run's progress is the last non-empty line of the file named by
`$NAIMA_RUN_PROGRESS`; the command may append lines or rewrite the file.

- A line that is a JSON object is **structured**. Its fields, each optional,
  a field of the wrong type ignored as if absent, any other field ignored:
  - `stage` — a string: what is being done now;
  - `done` — a number ≥ 0: how much of the stage is done;
  - `total` — a number > 0: how much the stage has to do;
  - `unit` — a string: what `done` and `total` count (`states`, `bytes`);
  - `note` — a string: anything else worth saying, such as the tool's last
    log line;
  - `overall` — an object `{ done, total, unit }`, the same three fields for
    the whole work around the stage (properties of a `verify --all`).
- Any other line is **free text**, shown as it is.

```sh
echo '{"stage":"render","done":12,"total":40,"unit":"frames"}' >> "$NAIMA_RUN_PROGRESS"
echo "compiling the second half" > "$NAIMA_RUN_PROGRESS"
```

## 3. Rate and ETA

1. The supervisor reads the progress line at every check (`--every`). The
   first structured line of a **stage** — a line whose `stage`, `unit` or
   `total` differ from the previous one — is kept in `status.json` as
   `progressFrom: { stage?, unit?, total?, done, at }`, `at` being the
   progress file's modification time. `overall` is kept likewise as
   `overallFrom`, its stage changing with its `unit` or `total`.
2. A reader takes the current line, with the file's modification time as its
   time, against the kept one: the **rate** is the `done` gained over the
   time passed, when both grew; the **ETA** is `(total − done) / rate`, less
   the line's age, never below 0, when the stage has a total. The overall
   rate and ETA are computed the same way from `overall` and `overallFrom`.
3. A run's view (`run status --json`, `run list --json`, a host's answer)
   carries, in `progress`, besides `line` and `ageMs`: `stage`, `done`,
   `total`, `unit`, `note`, `overall` when the line has them, `rate` (per
   second) and `etaMs` when they can be computed, and `overallRate` and
   `overallEtaMs` likewise.
4. It reads, in `run status` and `naima wait` as `progress: …`, in
   `run list` as `progress …`: the overall count first when there is one,
   then the stage and its count, each as `done/total unit (p%)`, or
   `done unit` without a total; then the rate (`/s`, `/min` or `/h`, whichever
   gives a number of at least 1), then `ETA` with the time left; then the note;
   then how long ago the line was written. A free-text line reads as it did,
   quoted.

## 4. A silent run, and a run that cannot report

1. `naima run --no-progress "<reason>"` declares that the command cannot
   report progress, and why; an empty reason is refused. It is kept in
   `run.json` as `noProgress`.
2. A run is **stale** when, while it runs, its activity is older than
   `--stale`: for a run that reports progress, the progress file's last
   change, or the start when there is none; for a `--no-progress` run, the
   last change of the log or of the progress file. `--stale` defaults to 2
   minutes, or 15 minutes for a `--no-progress` run.
3. For a `--no-progress` run, `run status` and `naima wait` print
   `no progress: <reason>` and the log's last line; `run list` adds
   `no progress (<reason>)` and the log's last line, quoted. Its elapsed time
   is shown, as for every run.
4. On a host, the host's Naima keeps the record and computes all of this; the
   view it answers carries it unchanged.

## 5. `naima wait` while it waits

While the run has not ended, `naima wait` prints to standard error, every
`--report` (default 30s; the first after one `--report`), one line:
`run <name>: <state>, <elapsed> · progress <as in §3.4>` — or, for a
`--no-progress` run, `no progress (<reason>), last said "<the log's last
line>"`; for a run that has written no progress yet, `no progress reported
yet`. Its final report and `--json` are unchanged.

## 6. Naima's own long work

A command whose work can last more than a few seconds says so in its
manifest, `long`: either `{ reports }`, how it reports progress, or
`{ cannot, instead }`, why it cannot and what it reports instead. The core
gives every command one reporter:

1. **Its calls:** a stage with its name and, when known, its total and
   unit; the count done; a note; the overall count; the end.
2. **Inside a run** (`$NAIMA_RUN_PROGRESS` is set): every change of stage,
   and every other change at most once a second, rewrites the progress file
   with one structured line (§2); while nothing changes, the line is
   rewritten every 5 seconds, so a stage the tool cannot count is not taken
   for silence; at the end the last state is written. Nothing goes to
   standard error.
3. **Outside a run:** nothing in the first 2 seconds, so short work stays
   quiet; then standard error gets `progress: <as in §3.4, rate and ETA
   computed in the process>` at a stage change, on a change at most every 2
   seconds, and every 5 seconds with the elapsed time while nothing changes.
4. A failure to write the progress file is ignored: progress never fails
   the work.

The commands:

- **`naima verify`**: the overall count is the properties done of those
  asked. Each tool the mCRL2 verifier starts is a stage, named
  `<property>: <tool>`. `lps2lts` and `pbessolve` are started with
  `--verbose`, and their standard error is read as it comes: the states
  explored (`lps2lts`, from its `<n>st, <m>tr, explored …` lines, unit
  `states`) and the BES equations generated (`pbessolve`, from its
  `Generated <n> BES equations` lines, unit `BES equations`) are the stage's
  count. Those counting lines are not kept in the run's output; every other
  line is. The other tools say no count: their stage, with the elapsed time.
  No mCRL2 tool states a total, so a stage has a rate and no ETA; the ETA is
  the overall one.
- **`naima metrics run`**: the overall count is the metrics taken of those
  asked, the stage named by the metric being taken; `metrics backfill`: the
  overall count is the commits measured of those to measure. A metric's own
  command reports nothing while it runs.
- **`naima tools install`**: the stage `download`, the bytes received of the
  declared size; then `unpack` and `verify`, without a count.

## 7. The check `progress-declared`

`naima check` reports:

1. **a problem** for each loaded command whose `long` gives neither a
   non-empty `reports` nor a non-empty `cannot` with a non-empty `instead`;
2. **a problem** for each `naima run` in a tracked shell script (`.sh`,
   `.bash`, `.zsh`, `.ksh`; read as shell words, quotes and line
   continuations included, comments skipped) that has no `--no-progress`
   with a reason, and whose command after `--` neither names
   `NAIMA_RUN_PROGRESS` nor runs a Naima command declared `long` with
   `reports`;
3. **a note** for each run recorded in this worktree, not declared
   `--no-progress`, that has run for longer than its `--stale` without
   writing a progress line.

## Changes from the previous version

None: the first version.
