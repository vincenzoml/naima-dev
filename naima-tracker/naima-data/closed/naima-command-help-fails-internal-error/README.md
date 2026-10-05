# naima <command> --help fails with an internal error

`naima event --help` (and the same with other commands) prints
`naima: internal error: TypeError: Unknown option '--help'` instead of the
command's usage. Seen on 2026-10-05 in VoxLogicA-2-clean at the lock 395c9332.
`naima help` works; the flag on a command does not.

## Evidence

The message above, from the command as typed. Still open: whether every
command fails the same way.
