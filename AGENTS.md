# Working on Naima

For anyone, person or agent, who changes this repository. Short on purpose:
each rule links the page that holds its reasoning.

## The rules

**The rules every project that uses Naima holds to — this one included — are
on one page, [the rules](naima/docs/guide/rules.md), each marked enforced or
convention. They are not repeated here.** Among them are the owner's three:
[asking](naima/docs/guide/rules.md#dont-ask-the-human-if-you-know-the-answer),
[documenting](naima/docs/guide/rules.md#features-are-documented-as-part-of-their-implementation)
and [waiting for the go](naima/docs/guide/rules.md#dont-start-implementing-until-the-owner-says-so).

This file holds only what applies to developing Naima itself: the modes, the
working rules below, and how a feature of Naima is documented — for people in
`docs/guide/`, for agents in `docs/agents/` and the skill, and in the
reference regenerated from the manifests with `deno task docs`
([the documentation rule](develop/documentation.md)).

## Modes

The working modes every agent obeys (quiet, simple, fast, reporting,
irreversible actions) are this project's rules, kept as tracker data: read
them with `deno task naima rules --audience agents` at the start of work
([rules as data](naima/docs/agents/read-the-project-rules.md)). Read them before anything else; QUIET MODE and FAST MODE are of paramount importance.

## Working rules

These apply only to this repository; the general ones are on
[the rules page](naima/docs/guide/rules.md).

- **This repository is the workshop; the product is its submodule.**
  `naima/` is a git submodule of `github.com/vincenzoml/naima`, the product a
  project clones. A change to Naima is two commits in order: in `naima/`, on a
  branch, merged into the product's `main` and pushed; only then the new
  submodule pointer here. A worktree gets its submodule without the network:
  `git submodule update --init --reference <main worktree>/naima`
  ([Naima tracking itself](develop/bootstrap.md)).
- **Naima tracks itself, and the tracker is managed by the locked commit.**
  `deno task naima <command>` runs the stable clone `naima-tracker/naima/`, a
  gitignored git clone of the product locked to a commit of its `main` by
  `naima-tracker/naima-data/naima.json`; `deno task dev <command>` runs the
  submodule, as a test, and never writes the tracker. Every tracker change
  goes through the CLI, never by hand. A change the tracker is about to use is
  pushed to the product's `main` first, then `deno task naima update` moves
  the lock to it: [Naima tracking itself](develop/bootstrap.md).
- **English**, in code, docs, items and commit messages.
- **Documentation states what is, never how it came to be.** History lives in
  git and in the tracker.

## Before pushing

```sh
git submodule update --init   # naima/ at the commit this workshop records
deno task verify    # typecheck, lint, format, tests, check (working tree and lock), reference current
node --test "test/**/*.test.ts" && bun test --timeout 30000 ./test/     # the same tests on Node and Bun
```

No CI runs them: these are the gate, run locally before every push. The site
is published by hand, `sh scripts/publish-site.sh`, with no secret or deploy key.

What Naima is for — a silent software house of agents, born for software,
that turns vibe coding into an exact science for an owner who only decides,
and then manages any project — is
[the purpose](naima/docs/purpose.md); what it does not do yet is
[planned](naima/docs/planned.md), and a page describes nothing planned as if
it existed. Requirements and design principles:
[requirements](develop/requirements.md).
Architecture and the dependency rule: [architecture](develop/architecture.md).
Everything else: [the documentation map](naima/docs/README.md).
