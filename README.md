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
are derived when read and never stored, and `naima check` holds the tracker to
its invariants the way a test suite holds the code. A small core loads
plugins; everything else — item types, triage, gates, coordination across
branches, formal verifiers, the documentation rule — is a plugin.

## Quick start

Requires Node 22.18 or later. No runtime dependencies.

Naima lives anywhere on the disk; a project using it carries only one
top-level `naima/` directory. In any git repository:

```sh
npx naima init                              # naima/config.json, pinned to this Naima
npx naima new bugs "Export drops the alpha channel"
npx naima check
```

Until the first public release it is not on npm: clone this repository,
`npm install` (which builds `dist/`), `npm link`, and use `naima` instead of
`npx naima`. Details: [using Naima in your project](docs/using-naima.md). An
agent can do all of this itself: [the Naima skill](docs/skill.md).

## Documentation

**[docs/](docs/README.md)** — concepts, configuration, the generated
reference of every command, type, field, relation, check, gate and plugin, the
plugin contract, the bootstrap policy, and the flows for people and AI agents.
Rules for working on this repository: [AGENTS.md](AGENTS.md).

Naima tracks itself, in `naima/`, managed by its previous stable release
through the same pin every project has (`npm run naima`); `npm run verify`
runs the typecheck, the tests, and `check` with both the stable and the
working tree.

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
