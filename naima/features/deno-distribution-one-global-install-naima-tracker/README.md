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
