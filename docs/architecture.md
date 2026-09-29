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
    git.ts         reading a directory across every branch worth reading
    config.ts      naima.config.json and plugin loading
    base.ts        the core's own contributions: generic fields, relations, commands
    cli.ts         dispatch
    testing.ts     a throwaway project for tests
  plugins/<name>/  one directory per first-party plugin, with its tests
  builtins.ts      first-party plugins by config name   } the composition root:
  cli.ts           the executable                        } the only modules that see both
```

## The tracker on disk

```
tracker/
  <TYPE>/<slug>/README.md       prose
  <TYPE>/<slug>/meta.json       fields: id, title, status, links, and whatever plugins declare
  <TYPE>/<slug>/attachments/    evidence
  CLAIMS/<uuid>.json            coordination: one file per branch that claims work
  PASSES/<date>-<uuid>.md       coordination: one file per session note
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

- The core imports only Node built-ins and itself.
- A plugin imports only `core/index.ts` and its own files. Its tests may also
  import `core/testing.ts`. Plugins never import each other: what one needs
  from another travels through the registry (a field, a relation, a status
  that `proves`, a gate, a verifier).
- `builtins.ts` and `cli.ts` compose the two.

`src/arch.test.ts` enforces the rule on every test run.

## Checks

`naima check` runs the core invariants (readable items, unique uuids, known
statuses, well-typed fields, resolvable links, no stray directories, unlinked
duplicate titles as a note) and every plugin's checks. A problem fails the
run; a note never does. A check that throws is reported as a problem, not a
crash.

## Git discipline

The coordination plugin writes files and never stages or commits them. The
flows that go with it — one worktree per piece of work, a worktree writes only
its own branch, every merge to the trunk is `--ff-only` — are tracked as
roadmap work in `tracker/TODOS/`.
