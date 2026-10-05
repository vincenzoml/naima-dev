# a command's --help prints its usage; an unknown flag is a usage error, never an internal one (test/cli.test.ts, on Deno, Node and Bun)

Seen red on 2026-10-05 before the fix: `naima event --help` ended with
`naima: internal error: TypeError: Unknown option '--help'`. Green after it: the
usage line printed with exit 0, and `--bogus` reported as a usage error naming
the flag. The fix is in two places: every command answers `--help` before it
runs, and the argument parser turns node:util's parse errors into usage errors.
