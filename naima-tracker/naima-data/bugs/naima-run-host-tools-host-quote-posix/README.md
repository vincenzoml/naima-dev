# naima run --host and tools --host quote for a POSIX shell, but a Windows host's sshd runs cmd

`sshArgs` (src/core/hosts.ts) sends `cd <shellQuote(dir)> && <naima> <shellQuote(arg)>…`,
quoting with single quotes. The stock Windows OpenSSH server runs the command
through cmd, which does not strip single quotes: any argument `shellQuote`
quotes (a `--consent "<yes>"`, a command with spaces after `--`, a `dir` with a
space) arrives with the quotes in it.

Seen the same way on 2026-10-09 with git on sleipnir (Windows 11, cmd default
shell): `git ls-remote sleipnir:path` failed with `''path'' does not appear to
be a git repository`, the quotes git put around the path reaching the program.
`naima tools --host sleipnir` works only because none of its words need quotes.

Expected: hosts declare their shell (or Naima detects cmd/PowerShell) and
quote for it; at least, refuse with a clear message instead of sending
arguments that will be mangled.
