# Deno distribution: one global install, naima-tracker/, a versioned open format

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

1. **The data directory is `naima-tracker/`** at the project root. It is a
   visible component of the repository, not a cache. It holds
   `naima-tracker/naima.json` and the items (`naima-tracker/bugs/`, …).
   Nothing else of Naima's is ever written into a project.
2. **The repository declares a data format version, not a tool version.**
   `naima.json` carries `format: <integer>` (plus the project's facts, such as
   its gates). There is no tool pin.
3. **Every action goes through the tool, from day 0.** Creating, triaging,
   linking, closing, checking and the gates all run through `naima`, so the
   checks are deterministic and they guide the agent.
4. **One global install, one version, managed by Deno.** Naima is installed
   with `deno install -g` from a release, with its permissions baked in:
   - read the repository;
   - write only under `naima-tracker/` (and git's own files through `git`);
   - run only `git`;
   - nothing else: no network, no env beyond what is needed, no other
     binaries.

   It lives in Deno's global bin directory. Updating overwrites it, so only
   one version exists on a machine. Until the public release, the install
   source is a local clone (`deno install -g -f … <clone>/src/cli.ts`). After
   it, the source is the published package.
5. **Forward-only migration.** When a project's `format` is older than the
   installed tool's, the tool migrates it deterministically, forward only, and
   the agent commits the migration as one commit. When it is newer, the tool
   refuses and says in one line to update Naima. That is the only refusal.
6. **Open format, extension through plugins.** The format is a versioned,
   public specification (`docs/format.md`): every file, field and invariant.
   Customisation is through the plugin contract. Plugins are loaded only from
   the install, never from a project's repository, so no code in a repository
   is ever executed by Naima. Forks are welcome; the format is the
   compatibility boundary.
7. **Runtime-agnostic code.** The code uses only standard APIs and stays
   dependency-free by default. CI runs the test suite on Deno, Node and Bun.
   Deno is the default and documented runtime. A dependency, if ever added,
   must be pure JavaScript, pinned in the lockfile, and justified.
8. **The skill manages the install.** When `naima` is missing, the skill
   (`skills/naima/SKILL.md`) installs Deno through its official installer and
   then Naima (behaviour 4). When a newer Naima is released, it updates it and
   lets behaviour 5 migrate each repository on its next touch.
9. **`deno compile` is optional.** A single executable is produced per
   release for those without Deno. It is not part of the normal path.

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

## Boundaries

- Nothing is published (JSR, npm, binaries): the repository is private, and
  publishing belongs to the first public release (the todo under
  `first-public` covers JSR and the release binaries).
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

- An end-to-end test (under Deno) creates a temporary git repository, runs
  `naima init`, `new` and `check`, and asserts that the only addition is
  `naima-tracker/`.
- A test shows that a format-1 repository is migrated forward by a newer tool,
  deterministically: the same input gives byte-identical output.
- A test shows that a newer-format repository is refused with the one-line
  message.
- A test shows that, run with the baked permissions, Naima cannot write outside
  `naima-tracker/` or run anything but `git` (Deno's permission error is
  asserted).
- The suite passes on Deno, Node and Bun.
- Naima's own repository is on `naima-tracker/`, format-versioned, and managed
  by the globally installed Naima. A new stable, v0.3.0, is tagged.
- `verify` passes.
