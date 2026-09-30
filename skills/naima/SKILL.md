---
name: naima
description: Work in a project tracked with Naima — bugs, todos, features, tests and their proofs kept as files under a top-level naima/ directory. Use when a repository has naima/config.json, when asked to report, triage, claim, fix, verify or close an item, or when asked to start tracking a repository with Naima.
---

# Naima

Naima is a project tracker whose items are files in the repository, under one
top-level `naima/` directory, and whose board is derived by a CLI, never
edited by hand. This skill is a pointer: the rules and the procedures live in
Naima's own documentation, linked below, and win wherever this page is shorter.

## 1. Have a `naima`

Run `naima help`. If there is no `naima` command, use `npx naima` in its place.
If that is not available either (Naima is not yet on npm), install it once,
anywhere on the disk, outside the project:

```sh
git clone https://github.com/vincenzoml/naima && cd naima && npm install && npm link
```

Details: [using Naima in your project](../../docs/using-naima.md#install-it-once-anywhere).

## 2. Have a project

From the repository, walk up to the directory holding `naima/config.json`.
When there is none and the work is to be tracked here, run:

```sh
npx naima init
```

It writes `naima/config.json` and touches nothing else. Commit `naima/` with
the work.

When a `naima` refuses because it is outside the project's pin, use the
version the refusal names: [the pin](../../docs/using-naima.md#the-pin).

## 3. Work by the flows

Every change to the tracker goes through the CLI (`naima new`, `set`, `link`,
`claim`, `close`); `naima check` must pass before a commit. What to do, and
when, is in the flows — read the one that applies before acting:

- [the flows, and when each applies](../../docs/flows/README.md)
- [concepts](../../docs/concepts.md): items, links, fixed / resolved / closed
- [reference](../../docs/reference.md): every command, type, status, field and gate

`naima help` lists the commands of the Naima in use; `naima summary` says where
the project stands.
