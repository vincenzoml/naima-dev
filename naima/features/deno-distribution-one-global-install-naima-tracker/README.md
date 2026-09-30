# Deno distribution: a per-project clone locked by commit, naima-tracker/, an open format

Defined with the owner on 2026-09-30. It supersedes parts of
`features/adopting-naima-automatic-branded-installable-anywhere-agent`, as
listed under *Reversals*. That feature's automatic-defaults behaviour and
agent skill stay.

## The owner's words

> "the data dir named like the repo name seems also odd" … "naima-tracker is
> the clearest, go with it"
>
> "this version clash seems dangerous"
>
> "it should be something that has no dependencies and the agents will manage
> themselves"
>
> "it will download and use scripts since day 0, this is all designed so
> checks are deterministic, to guide the agent in a secure way. And since it
> can be used in many projects, it needs to be installed in a deterministic
> safe place system-wide and it would be best if multiple versions did NOT
> coexist. Agents will learn to use new versions if they come out and adapt
> the repo."
>
> "the file formats and architecture must be wildly open, and people should be
> encouraged to modify naima to their needs"
>
> "deno seems really cool … then go with it"

## Behaviour

*Revised 2026-09-30 (second definition round, see Reversals). No
implementation until the owner says go (owner rule 3).*

1. **One folder, `naima-tracker/`, at the project root**, a visible component
   of the repository:
   - `naima-tracker/naima/` is the program and its corpus (flows, roles,
     rules, skill, docs): a git clone of Naima's repository, **gitignored**;
   - `naima-tracker/naima-data/` is the items, and `naima.json`;
   - `naima-tracker/README.md` is one line saying what Naima is, and a link to
     https://github.com/vincenzoml/naima (owner, 2026-09-30: "naima-tracker
     must have a README.md with one line explaining what naima is and a link
     to the repo"). The sentence has one shared source, the same as Naima's
     own README;
   - `naima-tracker/.gitignore` ignores `naima/`, so Naima touches no project
     file outside its folder.
2. **No releases, no version numbers, no compiled binaries.** Owner: "the tool
   itself manages updates by pulling from main. That's the release. No
   versions to manage. Commit id is a version." and "no compiled binaries,
   just execute from there". Deno executes the TypeScript directly from
   `naima-tracker/naima/`.
3. **The data records its Naima, like a lockfile.** `naima-data/naima.json`
   carries the data `format` (an integer), the Naima `source` (a git URL,
   Naima's by default) and the `commit` the data was last written and checked
   with, plus the project's facts, such as its gates. Every run aligns
   `naima-tracker/naima/` to exactly that source and commit, cloning it if it
   is absent. So everyone working on the project, and CI, runs the same
   Naima.
4. **Updating is an explicit step, never automatic.** `naima update` pulls
   the source's `main`, migrates the data forward if the format moved, and
   records the new commit, all as one reviewable commit in the project. No
   run ever pulls on its own: executing whatever lands on `main` is a supply
   chain risk.
   "Explicit" means a deliberate command, not a human-only one: agents run
   it (owner, 2026-09-30: "we assume naima-update can be run from agents").
   The skill tells them when: `naima update --check` at the start of a
   session says whether the source's `main` has moved; if it has, the agent
   runs `naima update`, lets the checks pass, and commits the result like any
   other change.
5. **Forward-only migration.** When the data's format is older than the
   checked-out Naima's, `naima update` migrates it deterministically, forward
   only: the same input gives byte-identical output. When it is newer (data
   written by a newer Naima than the recorded commit, which only happens by
   hand), the tool refuses in one line.
6. **Every action goes through the tool, from day 0**: create, triage, link,
   close, check, gates. The checks are deterministic, and they guide the
   agent.
7. **Deno, with permissions.** The launcher runs Naima under Deno with these
   permissions:
   - read the repository;
   - write only under `naima-tracker/`;
   - run only `git`;
   - network only for the git operations of alignment and update, which
     happen through `git`.

   Deno is the only thing installed on the machine, once, by its official
   installer.
8. **Modifying Naima is encouraged, and reproducible.** Whoever changes it
   edits `naima-tracker/naima/`, publishes it as a fork, and sets `source` in
   `naima.json` to the fork. The whole team then runs that fork at that
   commit. Improvements go back through pull requests.
9. **Open format.** `docs/format.md` is the versioned public specification
   of every file, field and invariant. The format is the compatibility
   boundary between forks.
10. **Plugins come from the program, not the data.** Code is executed only
    from `naima-tracker/naima/` (the recorded source and commit), never from
    `naima-data/`.
11. **Runtime-agnostic code.** The code uses standard APIs only and stays
    dependency-free by default. CI runs the tests on Deno, Node and Bun, and
    Deno is the documented runtime. A dependency, if ever added, must be pure
    JavaScript, pinned, and justified.
12. **Bootstrap and the skill.** In a project without Naima, the agent
    installs Deno if it is missing (official installer) and clones Naima into
    `naima-tracker/naima/`, and `naima init` creates the rest. The skill,
    shipped in the clone, tells the agent exactly this. Its corpus is plain
    markdown files in the clone, read directly as files; `naima guide` only
    prints the index and paths.

## Risk review (2026-09-30) and the mitigations now part of the behaviour

13. **Local changes in the clone are never overwritten.** Alignment (3) and
    `naima update` refuse when `naima-tracker/naima/` has uncommitted changes
    or commits that are not on the recorded source, and say: publish it as a
    fork and set `source`. Without this, aligning would silently destroy
    someone's modifications.
14. **An unreachable commit is a clear refusal.** If the recorded commit
    cannot be fetched from `source` (a rewritten history, or a deleted fork),
    the tool refuses and names the source and commit. Naima's own `main` is
    never rewritten: this is a repository rule.
15. **Format migrations and parallel branches.** A migration runs only through
    `naima update`, is idempotent, and `check` fails on a tracker that mixes
    formats. The flow says: update on its own branch, merge it first, then
    other branches merge `main` and run `naima update` again, which is a no-op
    or finishes the migration of their new items. Without this, two branches
    could merge a half-migrated tracker.
16. **Every worktree has its own clone.** `naima-tracker/naima/` is ignored,
    so each git worktree of a project gets its own clone. That is accepted:
    the clones are small. Alignment clones from an existing local clone when
    one is available (`git clone --reference`), so a new worktree does not
    download it again.
17. **Configurable locations, with one fixed anchor.** The defaults are
    `naima-tracker/naima/` and `naima-tracker/naima-data/`. Both are
    configurable:
    - the program directory: `program` in `naima.json`, a path relative to
      the data directory;
    - the data directory: found by walking up from the working directory to
      the first `naima-tracker/naima-data/naima.json`, or given by `--data
      <dir>` or `NAIMA_DATA`. A project that moves its data directory
      documents the flag in its tracker README.

    The anchor is always a `naima.json` carrying `format`.
18. **What the permissions do and do not protect.** Deno's permissions (7)
    are applied by the launcher. They stop a bug or a compromised dependency
    from reaching beyond `naima-tracker/` and `git`. They cannot stop a
    malicious commit that a project has chosen to update to, because the
    launcher is part of that commit. The protection against that is (4): an
    update is an explicit commit in the project, reviewable like any other.
    This limitation is written in `docs/install.md`, not hidden.
19. **First run needs git and network**, to clone. Offline, with no clone, the
    tool says so in one line. Once cloned, every run works offline.

## Naima tracking itself

Naima's own repository uses exactly the same model, with no special case:
- its data is `naima-tracker/naima-data/`;
- its `naima-tracker/naima/` is a gitignored clone of **Naima itself**, locked
  to a recorded commit of its own `main`. That locked commit is the "previous
  version" that manages the tracker;
- the working tree at the root is the development version: tested against the
  data, never managing it;
- `naima update`, run after a change is merged, verified and pushed, moves the
  lock to the new `main`. That is the bootstrap, and it is the same mechanism
  every project uses;
- `source` is Naima's own repository URL. Alignment can clone from the local
  repository's objects, so it needs no network.

## Reversals (owner rule: record, never overwrite)

- The per-project tool pin (a semver range in the config), and the refusal
  when outside it: replaced by the format version (behaviours 2 and 5).
- `npx naima` / `npm link` as the documented install: replaced by Deno
  (behaviour 4). The npm package stays possible, but is not the path.
- The `naima/` directory and `naima/config.json`: renamed to `naima-tracker/`
  and `naima-tracker/naima.json`. Naima's own repository migrates with
  `git mv`.
- The bootstrap policy (the development version managed by the previous
  pinned stable) becomes: the globally installed Naima manages Naima's own
  tracker; the working tree is tested against it but never manages it.

- *Second round, 2026-09-30:*
  - one global install, one version per machine, `deno install -g`, and
    `deno compile` binaries: replaced by the per-project gitignored clone,
    locked by commit, executed directly (behaviours 1–4 and 7);
  - "a data format version, not a tool version": kept, and extended with the
    recorded source and commit;
  - `naima-tracker/naima.json` and items directly under `naima-tracker/`:
    moved into `naima-tracker/naima-data/`.

## Boundaries

- Nothing is published: the repository is private. The default `source`
  (Naima's repository) becomes reachable to others at the first public
  release.
- No migration code for projects other than Naima itself: none exist yet.
  The migration mechanism exists, with Naima's own layout change as its first
  migration.

## Documentation (owner rule 2)

- `docs/format.md`: the open specification.
- `docs/install.md`: Deno, `deno install -g`, the permissions and why each
  one exists, updating.
- `docs/using-naima.md`: `naima init`, the layout, migration.
- The skill.
- `docs/reference.md`, regenerated.
- The pages about the pin, npx and `naima/` are updated per the reversals.

## Done when

- An end-to-end test (under Deno) creates a temporary git repository and runs
  the bootstrap, `naima init`, `new` and `check`. It asserts that the only
  addition is `naima-tracker/`, and that `git status` shows `naima-data/`,
  `README.md` and `.gitignore` but not `naima/`.
- A test shows that a second clone of the host repository aligns
  `naima-tracker/naima/` to the recorded source and commit.
- A test shows that `naima update` pulls, migrates and records the new commit,
  and that a normal run never pulls.
- A test shows deterministic forward migration: byte-identical output.
- A test shows that a newer-format refusal gives its one-line message.
- A test shows that, under the launcher's permissions, Naima cannot write
  outside `naima-tracker/` or run anything but `git`: Deno's permission error
  is asserted.
- A test shows that a fork `source` is honoured.
- The suite passes on Deno, Node and Bun.
- Naima's own repository uses this layout for its own tracker.
- `verify` passes.
