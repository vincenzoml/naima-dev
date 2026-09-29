# Naima

A project tracker for software built by people and AI agents together:
bugs, work, features, tests and the proofs that close them, kept as plain
files in the repository and checked like code. Formal-methods tools such as
model checkers plug in, so that a property of the software is tracked and
proven the same way a test is.

Status: research project, private while it takes shape. Open source by design.

## Why the name

**Coltrane.** *Naima* is John Coltrane's ballad on *Giant Steps* (1959). It is
built on pedal points: bass notes that hold still while the harmony above them
keeps moving. That is the architecture here — a small core that does not move,
and everything built on it free to change. It comes from the album where
Coltrane took harmonic rigour furthest, and it is the calmest, simplest piece
on it: rigour and beauty in the same place.

**Anima.** *Naima* is an anagram of *anima*, the soul: what makes a thing alive
from the inside. The tool is not the project; it is what keeps the project
alive and coherent as it grows.

**AI.** The name contains it. The work this tool organises is done more and
more by agents, and the tool is designed for them as much as for people.

**The word.** In Arabic, *naʿīma* means grace and calm. Five letters, said the
same way in every language, nothing to explain.

## What it is

Every item — a bug, a task, a feature, a test, a property — is a directory:
`README.md` for the prose, `meta.json` for the fields, `attachments/` for the
evidence. Items have permanent ids and typed links. Boards, queues and gates
are derived when read and never stored. `naima check` holds the whole tracker
to its invariants, the way a test suite holds the code.

Work in progress is coordinated through git: each session writes only its own
files on its own branch, and the collection is recombined from every branch
when read, so two sessions never edit one file.

Three states are kept apart: *fixed* (the code exists), *resolved* (fixed and
proven by an item that verifies it and has passed), *closed* (resolved and
archived with its proof). A property checked by a model checker counts as
proof exactly as a passed test does.

## Quick start

Requires Node 22.18 or later. No runtime dependencies.

```sh
npm install
npm run naima -- init                       # naima.config.json + tracker/
npm run naima -- new bugs "Export drops the alpha channel"
npm run naima -- new tests "Export keeps the alpha channel"
npm run naima -- link export-keeps verifies export-drops
npm run naima -- triage set export-drops impact=high priority=now effort=M
npm run naima -- check
npm run naima -- summary
npm run naima -- help                       # every command the loaded plugins provide
```

`npm run verify` runs the typecheck, the tests, and `naima check` on this
repository's own tracker: Naima tracks itself, in `tracker/`.

## Architecture

A small core knows items, fields, links, invariants, reading git across
branches, and how to load plugins; it knows no item type, gate or workflow.
Everything else is a plugin declared through one contract and selected in
`naima.config.json`: `trackers` (bugs, todos, features, tests, the closed
archive), `coordination` (claims and session notes), `triage` (four fields and
the urgency ranking), `gates` (named release conditions), `beta-markers`
(behaviour shipped without proof, marked in the code) and `verifier` (formal
methods tools as evidence). The core imports no plugin, a plugin imports only
the core's public API, and a test enforces both. Details:
[docs/architecture.md](docs/architecture.md).

## Plugin contract

A plugin is a module whose default export takes its options and returns a
manifest. Every part is optional: item `types` with their statuses, `fields`,
link `relations`, reserved `dirs`, `checks` (problems fail, notes inform),
`commands`, `views`, `summary` sections, `rank` terms, `gates`, and
`verifiers`. Names are global; two plugins declaring the same one is an error
at load time. Details: [docs/plugin-contract.md](docs/plugin-contract.md).

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
