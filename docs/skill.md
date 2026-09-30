# The Naima skill

Naima ships an agent skill, [`skills/naima/SKILL.md`](../skills/naima/SKILL.md),
in the format agent tools load: a directory named after the skill holding a
`SKILL.md` whose front matter gives its `name` and a `description` that says
when to use it.

## What it teaches

- **Get a `naima`.** Use `naima` when it is installed, `npx naima` otherwise,
  and when neither works, clone this repository and link it
  ([install it once, anywhere](using-naima.md#install-it-once-anywhere)).
- **Get a project.** When the repository has no `naima/`, run `npx naima init`
  ([just add naima](using-naima.md#just-add-naima)); when a `naima` refuses
  because of the pin, use the version it names.
- **Work by the flows.** Change the tracker only through the CLI, run
  `naima check` before a commit, and follow the [flows](flows/README.md).

It is a thin pointer, never a second copy: the rules are in the
[flows](flows/README.md), [concepts](concepts.md) and the
[reference](reference.md), and the skill links them. Its links are checked by
`naima check` like every other markdown file in this repository.

## Loading it

Point the agent tool at the directory where Naima is, rather than copying
the file, so the skill's links keep resolving. For Claude Code:

```sh
ln -s <path-to-naima>/skills/naima ~/.claude/skills/naima
```

The skill then applies in every project, and nothing is written into any of
them.
