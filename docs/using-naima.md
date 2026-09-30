# Using Naima in your project

Naima lives anywhere on the disk. A project that uses it carries one thing:
a top-level `naima/` directory.

## Install it once, anywhere

Any of these; none writes into a project.

| How | Command |
|---|---|
| no install | `npx naima <command>` |
| global install | `npm install -g naima`, then `naima <command>` |
| a clone | `git clone https://github.com/vincenzoml/naima`, then in it `npm install && npm link` |

Naima is not on npm until its first public release, so today the clone is the
way: `npm install` builds `dist/` (the `prepare` script), and `npm link` puts
`naima` on the path. Node 22.18 or later; no runtime dependencies.

Anything Naima caches — a stable release it extracts to manage its own
repository ([bootstrap policy](bootstrap.md)) — goes in the user's cache
directory, never in a project.

## Just add naima

In any git repository:

```sh
npx naima init
```

It creates `naima/config.json`, pinned to the Naima that ran it, and prints
the one next command. It asks nothing and touches no file outside `naima/`;
run again, it changes nothing. Then:

```sh
naima new bugs "Export drops the alpha channel"
naima check
git add naima && git commit -m "Track this project with Naima"
```

Every first-party plugin is already on, with defaults inferred from the
repository: [the automatic principle](config.md#the-automatic-principle).

## The naima directory

```
naima/
  config.json          the pin, and the few facts that cannot be inferred
  bugs/<slug>/         one directory per item: README.md, meta.json, attachments/
  todos/  features/  tests/  closed/  properties/
  claims/  passes/     coordination across branches: one file per session
```

Only the directories that hold something exist. Nothing else of Naima's is
written into the project: no code, no `node_modules`, no cache. Commands work
from any subdirectory: Naima walks up from the current directory to the first
one holding `naima/config.json`.

## The pin

`naima/config.json` always records which Naima manages the project:

```json
{ "naima": "^0.2.0" }
```

A semver range. A `naima` outside it refuses to act and says, in one line,
which version to use — so two people, or a person and an agent, never manage
one tracker with two formats. To move a project to a newer Naima, change the
range and run `naima check`. The other keys: [configuration](config.md).
