# Installing and updating Naima

Naima has no releases, no version numbers and no compiled binaries. A
project runs Naima from a git clone of it, `naima-tracker/naima/`, locked to
one commit; that commit is the version. Deno runs the TypeScript directly.

## Deno, once per machine

Deno is the only thing installed on the machine, once, by its official
installer:

```sh
curl -fsSL https://deno.land/install.sh | sh     # macOS, Linux
irm https://deno.land/install.ps1 | iex          # Windows PowerShell
```

Nothing is installed globally for Naima itself: no `deno install -g`, no
package, no binary on the path. Each project carries the Naima it runs, so
two projects on one machine never share one, and never clash.

## Bootstrap a project

In a git repository that does not use Naima yet:

```sh
git clone https://github.com/vincenzoml/naima.git naima-tracker/naima
deno run -A naima-tracker/naima/naima.ts init
git add naima-tracker && git commit -m "Track this project with Naima"
```

`init` writes `naima-tracker/README.md`, `naima-tracker/.gitignore` (which
ignores `naima/`) and `naima-tracker/naima-data/naima.json`, locked to the
source and commit of the clone that ran it. Nothing else in the project is
touched. What goes in the folder: [using Naima in your project](using-naima.md).

A long command is worth an alias:

```sh
alias naima='deno run -A "$(git rev-parse --show-toplevel)/naima-tracker/naima/naima.ts"'
```

The rest of the documentation writes `naima <command>` for it.

## Every run aligns the program

Before it does anything else, every run makes `naima-tracker/naima/` exactly
the `source` and `commit` in `naima.json`, cloning it when it is absent. So a
fresh clone of the project, a new worktree, a colleague and CI all run the
same Naima. Where the project has no program yet, there is no launcher in it
either: clone the `source` into `naima-tracker/naima/`, or run the launcher of
any Naima at hand from inside the project — the main worktree's, say. Either
way, the run ends aligned. Alignment:

- **never overwrites work.** When the program directory has uncommitted
  changes, or commits its source does not have, it refuses and says: publish
  them as a fork and set `source`. Modifying Naima is welcome
  ([below](#modifying-naima)); losing the modification silently is not.
- **refuses a commit it cannot reach**, naming the source and the commit:
  a rewritten history, or a deleted fork. Naima's own `main` is never
  rewritten.
- **needs git and the network once**, to clone. With no clone and no
  network it says so in one line. Once cloned, every run works offline.
- **clones from this disk when it can.** Every git worktree of a project has
  its own ignored program directory; a new one is cloned from the main
  worktree's, or from the project itself when the project is Naima, so it is
  not downloaded again.
- **never pulls.** Running whatever lands on a branch would be a supply
  chain risk. Only `naima update` asks the source anything.

## Updating

```sh
naima update --check     # has the source's main moved past the lock? exit 1 when it has
naima update             # move the lock to it
```

`update` fetches the source's `main`, moves the program to it, migrates the
data forward if its format moved ([migrations](format.md#migrations)), and
records the new commit in `naima.json`. The result is one change to review and
commit like any other:

```sh
git add naima-tracker && git commit -m "Update Naima to <commit>"
```

"Explicit" means a deliberate command, not a human-only one: an agent runs
`naima update --check` at the start of a session and, when main has moved,
`naima update`, the checks, and the commit ([the skill](skill.md)). With
several branches open, update on a branch of its own and merge it first; the
others merge the trunk and run `naima update` again, which finishes the
migration of their new items or does nothing.

## The permissions

`naima.ts` is the launcher. It runs with every permission (`-A`), and all it
does is work out where the project and the program are and run the program
under Deno with only these:

| Permission | Granted | Why |
|---|---|---|
| read | the repository, and the program wherever it is | items, the project's markdown and source (the docs and beta-marker checks read them), git's view of branches |
| write | `naima-tracker/` only, and the data or program directory if moved out of it | items, claims, notes, the program's own alignment; nothing else in the project |
| run | `git` only | alignment, update and carry, and reading claims and notes across branches |
| env | the environment | a child process is handed its environment, and git needs it |
| net | none | the network is git's, in alignment and update |

A command that tries anything else fails with Deno's own error, for example
`Requires write access to "…/escaped.txt"` or `Requires run access to "ls"`.
One consequence: `naima docs --write` can write only inside the tracker
folder when launched; Naima's own repository regenerates its reference with
the development build (`deno task docs`).

**What this does not protect.** The permissions stop a bug, or a compromised
dependency, from reaching beyond `naima-tracker/` and `git`. They cannot stop a
malicious commit that a project has chosen to update to, because the launcher
is part of that commit. The protection against that is the update itself: it
is an explicit, reviewable commit in the project, and nothing moves the lock
without one.

## Modifying Naima

Naima is meant to be changed. Edit `naima-tracker/naima/`, commit there, and
publish it as a fork; then set `source` in `naima.json` to the fork and
`commit` to your commit (or run `naima update` once the fork's `main` has it).
The whole team then runs that fork at that commit. A plugin of your own lives
in the fork, and `plugins` names it by its path there ([configuration](config.md)).
Improvements go back through pull requests. The data stays compatible as long
as the fork keeps [the format](format.md).

## How the program is carried

By default the program is a clone, ignored by git. A project that prefers to
commit it can switch, and switch back, at any time:

```sh
naima carry vendored     # the program committed as plain files
naima carry submodule    # a git submodule
naima carry clone        # back to the ignored clone
```

Each switch stages exactly what it changed — under `naima-tracker/`, plus
`.gitmodules` in submodule mode — so it is one commit. The lock and `update`
work the same in every mode ([the format](format.md#how-the-program-is-carried)).

## Other runtimes

The code uses the standard APIs that Deno, Node and Bun share, and has no
dependencies; its tests run on all three. Deno is the documented runtime
because of its permissions. Run directly with Node or Bun (`node
naima-tracker/naima/src/cli.ts <command>`), Naima works on the data, but it
does not align, update, or carry, and nothing fences it in.
