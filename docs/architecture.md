# Architecture

## Layout

```
src/
  core/            the core: no item type, gate or workflow is named here
    types.ts       the contract (every interface a plugin sees)
    index.ts       the public API — the only core module a plugin imports
    item.ts        an item on disk: create, move, save
    repo.ts        reading the tracker; ids, reference resolution, inverse links
    fields.ts      field validation and parsing
    registry.ts    merging plugin manifests; conflicts are errors
    check.ts       the core invariants, and running every plugin's
    lifecycle.ts   questions answered from type declarations: open, proves, urgency
    errors.ts      how Naima fails: NaimaError, message(e), the exit codes
    collections.ts small shared helpers: groupBy, the frozen collections of the registry
    git.ts         the one git wrapper (runGit, gitOrNull, mustGit); reading across every branch; the project's files
    files.ts       the one walker (regular files only, links never followed); writeFileAtomic
    layout.ts      naima-tracker/ and its names; finding the data directory
    config.ts      naima.json: the lock, gates, third-party plugin loading
    format.ts      the data format, migrations, the one-format check
    excludes.ts    the host tool configurations init prints, or writes, an exclusion for
    program.ts     the program directory: alignment, update, carry — all through git
    base.ts        the core's own contributions: generic fields, relations, commands
    cli.ts         dispatch, and the commands that move the program
    testing.ts     a throwaway project for tests
  plugins/<name>/  one directory per first-party plugin, with its tests:
                   trackers, coordination, triage, gates, beta-markers, verifier, docs
  builtins.ts      every first-party plugin, always loaded } the composition root:
  cli.ts           the program's entry point             } the only modules that see both
  launcher.ts      runs the program under Deno's permissions (install.md)
```

```
naima.ts            the launcher's executable: deno run -A naima.ts <command>
deno.json           the tasks: naima, dev, typecheck, test, docs, verify, dist, coverage
skills/naima/       the agent skill (skill.md), and the flow commands in commands/flow/
docs/reference.md   generated from the manifests by naima docs; never edited by hand
dist.json           the runtime allowlist: the files a dist commit, and so a project, holds
scripts/dist.ts     builds the dist commit of a main commit from dist.json (install.md#the-dist-branch)
scripts/coverage.ts coverage of the whole test run, the launched copies of the program counted as the files they copy
.claude/commands/   a link to skills/naima/commands/, for this repository's own agents
.github/workflows/  CI: verify on Deno, the tests on Node and Bun, on Linux and macOS; the dist on main
```

What ships is only what runs: `naima.ts`, `src/` without its tests and
`core/testing.ts`, `docs/`, `skills/naima/`, `README.md`, `LICENSE` and
`NOTICE`. `src/dist.test.ts` holds the allowlist to that: no test, no
development file, no tracker item, and every import and every relative link
of what ships resolving inside it.

## The tracker on disk

Everything Naima writes into a project is under one top-level folder,
`naima-tracker/`, and the items are in its `naima-data/`
([the format](format.md)):

```
naima-tracker/naima-data/
  naima.json                    the format, the lock, and the facts that cannot be inferred
  <type>/<slug>/README.md       prose
  <type>/<slug>/meta.json       fields: id, title, status, links, and whatever plugins declare
  <type>/<slug>/attachments/    evidence
  claims/<uuid>.json            coordination: one file per branch that claims work
  passes/<date>-<uuid>.md       coordination: one file per session note
```

The directory name is the slug and may change; the uuid in `meta.json` is
permanent and is what links hold. Only one direction of a link is stored; the
inverse is derived when read. Unknown fields are preserved and not checked.

## Derived, never stored

No board, queue, gate status or claim table is ever written. Each is computed
from the items when asked, so no stored copy can go stale. The same holds for
state that belongs to no branch: claims and session notes are written as one
file per session on that session's own branch, and `readAcrossBranches`
recombines them from every unmerged branch, every worktree's head, and the
trunk. The branch a worktree stands on is read from disk, so uncommitted
records count.

## The dependency rule

- The core imports only the `node:` built-ins that Deno, Node and Bun all
  provide, and itself. There are no dependencies.
- A plugin imports only `core/index.ts` and its own files. Its tests may also
  import `core/testing.ts`. Plugins never import each other: what one needs
  from another travels through the registry (a field, a relation, a status
  that `proves`, a gate, a verifier).
- `builtins.ts` and `cli.ts` compose the two.

- The core names no plugin's type, field, relation or plugin in its code: it
  works with any set of plugins.

`src/arch.test.ts` enforces the rule on every test run, on every way one
module reaches another — static, side-effect and dynamic imports, re-exports,
`require` — for the first-party plugins and for a fork's own under `plugins/`.
The one computed import allowed is the core loading a third-party plugin.

## Checks

`naima check` runs the core invariants (readable items, unique uuids, known
statuses, well-typed fields, resolvable links, no stray directories, unlinked
duplicate titles as a note) and every plugin's checks; the full list is in the
[reference](reference.md). A problem fails the
run; a note never does. A check that throws is reported as a problem, not a
crash.

## Git discipline

The coordination plugin writes files and never stages or commits them. The
flows that go with it — one worktree per piece of work, a worktree writes only
its own branch, every merge to the trunk is `--ff-only` — are in
[flows](flows/README.md).
