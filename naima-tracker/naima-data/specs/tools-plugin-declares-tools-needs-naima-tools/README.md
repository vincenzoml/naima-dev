# Tools: a plugin declares the tools it needs; naima tools reports, installs and removes them in a discardable directory

The behaviour, said so that it can be checked: what goes in, what comes out,
and the cases at the edges. The feature it specifies is
features/plugin-declares-external-tools-needs-naima-reports; the owner's
decisions it rests on are
decisions/naima-installs-plugin-s-tools-machine-runs (Naima installs a
plugin's tools on the machine it runs on),
decisions/naima-portable-installs-every-tool-into-own (into its own
discardable directory, never into the system) and
decisions/naima-runs-natively-every-platform-what-naima (natively on every
platform; what Naima can ship it ships).

## 0. The problem

The mCRL2 verifier plugin (`verifier-mcrl2`) names the programs it starts and
takes a `bin` option; a missing tool is an error run beginning
`tool missing:`. Nothing says which version is needed, nothing checks a
machine ahead of the work, nothing installs. On the machine where the
coordination model was first checked, mCRL2 202607.0 was installed by hand
into `/Applications` and linked into `~/.local/bin` (session note of
2026-10-01): a system install, with residue, repeated by hand on every
machine. Storm, wanted for a quantitative model, is not installable at all
today without a Python of the right version, which macOS does not ship.

## 1. A tool declaration

A plugin declares the tools it needs under `contributes.tools`, the point the
`tools` plugin declares. A declaration holds:

- `name` — one word, lowercase: how `naima tools install <name>` names it.
- `title`, `says` — what it is, for the report.
- `version` — the exact version pinned. One version per declaration: no
  range, no "latest".
- `licence` — the licence's SPDX identifier and a sentence when the artefact
  bundles others; `homepage`.
- `needs` — other tools installed first (Storm needs a Python).
- `programs` — the programs it provides, by name; for each platform, the
  directory inside the install that holds them (`bin`).
- `verify` — how an install is checked: a program of `programs`, its
  arguments, and a string its output must contain (the version).
- `platforms` — one entry per platform, `darwin-arm64`, `darwin-x64`,
  `linux-x64`, `linux-arm64`, `windows-x64`; each is either a source or an
  answer:
  - a source: `url`, `size` (bytes), `sha256`, `format` (`zip`, `tar.gz`,
    `dmg`, `deb` or `pip`), `bin` (where the programs are, inside the
    install), optionally `unpacked` (bytes on disk once unpacked), and for `dmg` the `app` to copy out of the image; a `pip`
    source names the Python tool it installs with (`python`), and the
    requirement lines, every one pinned with `==` and its `--hash`es;
  - an answer: `unavailable`, a sentence saying why there is no source for
    that platform and what to do instead.

A platform the declaration does not name at all is reported as having no
declaration for this platform. A declaration without a version, a licence, a
`verify`, or a source without `url`, `size` or `sha256`, is refused when the
plugin loads, naming the plugin and the missing key.

## 2. The tools directory

Every tool is installed into one directory per user and machine, never into
the system, never onto PATH:

- `$NAIMA_TOOLS` when set (an absolute path);
- otherwise `~/Library/Application Support/naima/tools` on macOS,
  `$XDG_DATA_HOME/naima/tools` (default `~/.local/share/naima/tools`) on
  Linux, `%LOCALAPPDATA%\naima\tools` on Windows.

A tool lives in `<dir>/<name>/<version>/`, with `naima-tool.json`, its
receipt: the declaration's version, platform, url, sha256 and size, when it
was installed, by which Naima, and the consent (§4). An install is built in
`<dir>/.staging-<random>/` and renamed into place only once verified, so a
failed or interrupted install leaves no tool behind. Deleting `<dir>` removes
every tool and leaves the machine as it was; running `naima tools install`
again reinstalls.

## 3. `naima tools`: what this machine has

`naima tools [--json] [--host <h>]` prints the platform, the directory, and
for every tool the loaded plugins declare: the plugin, the version pinned,
and one state:

- `installed` — its receipt is in place, for the pinned version, and every
  program it declares is there;
- `missing` — no install of the pinned version (an install of another
  version is named beside it);
- `unavailable` — the declaration's answer for this platform, said in full;
- `no declaration for this platform`.

For a tool that can be installed, the line ends with the command that
installs it. `naima tools show <tool> [--json]` prints what an install here
would fetch: for the tool and every tool it needs, the source, the size, the
licence, the sha256 and the format. Neither command writes anything.

## 4. `naima tools install <tool>`: consent, download, check, unpack, verify

1. The plan: the tool and every tool of its `needs` not yet installed, each
   with source, size and licence, printed before anything is fetched. A tool
   unavailable on this platform is refused with its answer; nothing is
   fetched.
2. Consent, once for the whole plan. On a terminal, Naima asks
   `Install? [y/N]` and only `y` or `yes` goes on. Without a terminal — an
   agent — the install needs `--consent "<the yes, restated>"` and
   `--by <who gave it>`; without them it refuses, printing the plan. The
   consent — how it was given, by whom, the words, when — is written into
   every receipt of the plan. The consent covers the licence shown: a macOS
   image that asks to accept its licence agreement is answered yes only
   after it.
3. Download, into the staging directory: the size must equal the declared
   size and the sha256 the declared one, or the install stops, removing the
   staging directory, and says which differed.
4. Unpack, by format, with the platform's own programs: `zip` and `tar.gz`
   by `tar` (bsdtar on macOS and Windows reads zip); `dmg` by `hdiutil
   attach -readonly -nobrowse` on a mount point inside the staging directory,
   copying the declared `app`, then `hdiutil detach`; `deb` by reading the
   `ar` archive and unpacking its `data.tar.*` with `tar`, without dpkg and
   without root; `pip` by the needed Python's `-m venv` into the install,
   then that venv's `pip install --require-hashes --only-binary :all:
   --no-deps` on the pinned requirement lines.
5. Verify: run the declared program with its arguments from the staged
   install; its output must contain the declared string, or the install
   stops and nothing is kept.
6. Write the receipt, rename the staged install into place, print where it is.

A tool already installed at the pinned version is reported as such and
nothing is fetched. Nothing is written outside the tools directory: no PATH,
no shell file, no system directory.

## 5. Available to the verifiers, without PATH

The core gives every plugin `installedProgram(tool, program)`: the absolute
path of that program in the installed pinned version on this machine, or
null. The mCRL2 verifier uses, in order: its `bin` option, the installed
`mcrl2`, then PATH. The launcher lets every command read the tools directory,
so a contribution can find its programs, and grants their absolute paths to
run through the contribution's `runs`, as it grants any declared program.

`naima tools` alone is granted besides: writing the tools directory, the
network (a download is redirected from the host named to a content host the
declaration cannot know), and running any program — the unpackers, the
Python installing, and the tool being verified, none of which exists when
the launcher starts. No other command gets any of these.

## 6. `naima tools remove <tool>`

Removes `<dir>/<tool>/` — every version of it — and says what it removed. It
refuses a tool that another installed tool needs (the Python under Storm's
venv), naming that tool. Removing what is not installed says so and exits 0.

## 7. Another machine: `--host`

`naima tools --host <h>`, `naima tools show <tool> --host <h>`,
`naima tools install <tool> --host <h>` and `naima tools remove <tool> --host
<h>` ask the host's own Naima, over one non-interactive ssh call each, as
`naima run --host` does, with the hosts the long-work plugin declares. An
install on a host first asks the host for its plan (`tools show --json`),
shows it here and asks the consent here, then hands the host the install
with `--consent` and `--by`. The host's Naima writes the receipt there.

## 8. The first tools, by platform

| Tool | Version | Declared by | macOS arm64 | macOS x86_64 | Linux x86_64 | Linux arm64 | Windows x86_64 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mcrl2` | 202607.0 | `verifier-mcrl2` | `.dmg` (43 MB) | `.dmg` (44 MB) | `.deb`, unpacked (28 MB) | none: no build published | `.zip` (127 MB; 784 MB unpacked) |
| `python` | CPython 3.13.16, build 20261003 | `storm` | `tar.gz` (25 MB) | `tar.gz` (25 MB) | `tar.gz` (35 MB) | `tar.gz` (29 MB) | `tar.gz` (22 MB) |
| `storm` | stormpy 1.14.0 | `storm` | wheel (37 MB) | wheel (39 MB), macOS 15 or later | wheel (51 MB), glibc 2.34 or later | wheel (47 MB), glibc 2.34 or later | none: no wheel published |

- mCRL2 on Linux is published as a system package only (`.deb`, `.rpm`).
  The plugin's answer, per the portability decision, is to unpack the `.deb`
  into the tools directory without installing it: its programs find their
  libraries through `$ORIGIN/../lib`, and it needs the system's glibc 2.38
  and libstdc++ 13 or later (Ubuntu 24.04, Debian 13 and later). An older
  system fails at the verify step and is reported, not half-installed.
- mCRL2 on Linux arm64: no build exists; building from source is not shipped.
  `naima tools` says so.
- Storm on Windows: stormpy ships no Windows wheel. What the decision on
  native platforms asks — Naima reaching a Linux environment for that tool,
  behind the plugin — is not built; and turning WSL on needs administrator
  rights, which Naima cannot ship. `naima tools` says so, and that the work
  can go to a macOS or Linux host with `naima tools install storm --host
  <h>`.
- The Python is shipped (python-build-standalone), not taken from the
  system: macOS's own `python3` is 3.9, older than stormpy's 3.10.

The `storm` plugin is off until a project switches it on, like the verifier
plugins: it declares the tools, and `naima tools path storm python` prints
the venv's Python for a project's scripts. The Storm verifier is its own
feature (features/verifier-storm-probabilistic-properties-checked-by-storm).

## 9. Design choices, and the alternatives rejected

1. **One directory per user and machine.** Rejected: one per project, inside
   the tracker folder — every worktree is a project folder, so each `naima
   open` would reinstall hundreds of megabytes; a system directory — needs
   root and leaves residue (the portability decision).
2. **An exact version and a sha256, per platform, in the declaration.**
   Rejected: a version range with detection of what is on PATH — the evidence
   records the tool's version, so a range makes two machines prove different
   things; trusting TLS alone — a replaced artefact would install silently.
3. **The platform's own unpackers** (`tar`, `hdiutil`) and a reader of the
   flat `ar` format. Rejected: archive libraries in TypeScript — the product
   has no dependencies, and `tar` is the tool built for the job on all three
   systems (Windows 10 ships bsdtar); `dpkg -x` — not present outside Debian.
4. **mCRL2 on Linux from its `.deb`, unpacked.** Rejected: `apt`/`dpkg`
   install — root and system residue; building from source — a compiler
   toolchain and an hour, per machine.
5. **A shipped Python** (python-build-standalone, pinned). Rejected: the
   system's — absent on Windows, too old on macOS, a different one on every
   machine.
6. **pip's hash-checking mode** for stormpy and its two dependencies
   (Deprecated, wrapt), binary wheels only. Rejected: Naima downloading the
   wheel itself — pip would still fetch the dependencies unchecked;
   unpinned `pip install stormpy` — not reproducible.
7. **Consent asked once per plan, recorded in each receipt on that machine.**
   Rejected: recorded in the tracker — an install is a fact about one
   machine, not about the project's history; a blanket `--yes` — it would
   record no one's consent.
8. **A dedicated grant for `naima tools`**, as `naima ui` and `naima run`
   have theirs. Rejected: widening every command; a network grant per host —
   a release download is redirected to a content host no declaration can
   name.
9. **A remote install is the host's own Naima**, as a remote run is.
   Rejected: copying artefacts over ssh — the host's platform, directory and
   receipts are the host's to know.
10. **Storm declared by an opt-in `storm` plugin** until the Storm verifier
    exists. Rejected: a catalogue of tools inside the `tools` plugin — the
    owner's ask is that plugins declare their tools.
11. **Verify by running the tool.** Rejected: the checksum alone — it proves
    the download, not that the tool runs on this machine (a Linux too old
    for the `.deb`, a macOS too old for the wheel).

## Changes from the previous version

None: the first version.
