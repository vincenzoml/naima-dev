# Using Naima in your project

A project that uses Naima carries one folder, `naima-tracker/`, at its root,
and runs the Naima inside it. Installing Deno and bootstrapping the folder:
[installing and updating](install.md).

## Just add naima

In any git repository, once Naima is cloned into `naima-tracker/naima/`:

```sh
naima init
```

It creates the rest of `naima-tracker/`, locked to the Naima that ran it, and
prints the one next command. It asks nothing and touches no file outside
`naima-tracker/`; run again, it changes nothing. Then:

```sh
naima new bugs "Export drops the alpha channel"
naima check
git add naima-tracker && git commit -m "Track this project with Naima"
```

Every first-party plugin is already on, with defaults inferred from the
repository: [the automatic principle](config.md#the-automatic-principle).

## The naima-tracker folder

```
naima-tracker/
  README.md            one line: what Naima is, and a link to it
  .gitignore           ignores naima/
  naima/               the program: a clone of Naima at the locked commit, never committed
  naima-data/
    naima.json         the format, the lock, and the few facts that cannot be inferred
    bugs/<slug>/       one directory per item: README.md, meta.json, attachments/
    todos/  features/  tests/  closed/  properties/
    claims/  passes/   coordination across branches: one file per session
```

`git status` shows `naima-data/`, `README.md` and `.gitignore`, never
`naima/`. Only the item directories that hold something exist. Commands work
from any subdirectory: Naima walks up from the current directory to the first
`naima-tracker/naima-data/naima.json`. Every file and field is specified in
[the format](format.md).

## The lock

`naima.json` records which Naima runs the project — its `source` and its
`commit` — and every run aligns `naima-tracker/naima/` to exactly that, so
two people, or a person and an agent, never manage one tracker with two
different Naimas. The lock moves only with `naima update`, as one reviewable
commit: [updating](install.md#updating).

## Migration

The data has a format, a number in `naima.json`. When an update brings a
Naima that reads a newer format, `naima update` migrates the data forward in
the same change, deterministically. A Naima never acts on data in another
format: newer data is refused in one line, older data is left to `naima
update`, and `naima check` fails on a tracker whose items mix formats — the
mark of a branch that has not merged the trunk's update yet. What to do then:
[migrations](format.md#migrations).

## Moving things

- **The data directory** can live anywhere in the repository. Move it with
  `git mv`, and run Naima with `naima --data <dir>` or `NAIMA_DATA=<dir>`;
  say so in the tracker's README, so that the next person finds it.
- **The program directory** is `program` in `naima.json`, relative to the data
  directory.
- **How the program is carried** — an ignored clone, committed files, or a git
  submodule — is one command away: [how the program is carried](install.md#how-the-program-is-carried).
