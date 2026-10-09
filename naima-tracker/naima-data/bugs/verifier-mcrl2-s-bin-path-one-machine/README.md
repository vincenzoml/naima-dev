# verifier-mcrl2's bin is a path on one machine, kept in the shared naima.json

VoxLogicA-2-clean sets `plugins.verifier-mcrl2.options.bin` to
`/Applications/mCRL2.app/Contents/bin` (the owner's Mac). The same checkout on a
second machine (sleipnir, Windows, mCRL2 202607.0 installed by `naima tools
install mcrl2`) then looks for `\Applications\mCRL2.app\Contents\bin\mcrl22lps`
and finds nothing: `bin`, when given, wins over the installed tool.

Workaround used on 2026-10-09: on the Windows clone only, `bin` removed from
naima.json and the file marked `git update-index --skip-worktree`.

Expected: a machine-specific path does not live in the project's shared
configuration — a per-machine override (an ignored local file, or an
environment variable), or `bin` used only when it exists, falling back to
the installed tool and PATH.
