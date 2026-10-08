# The long-work toolset runs natively on macOS, Linux and Windows

Specification: specs/long-work-naima-run-wait-run-list, section 6.

Checked by: the test suite on macOS and on Linux, on Deno, Node and Bun; for Windows, the platform choices (shell, ending a tree) computed for win32, and a run of the suite on a Windows machine, which is still owed.

Why: the owner's decision that Naima runs natively on every platform (decisions/naima-runs-natively-every-platform-what-naima): a toolset that works on one platform would push agents on the others back to improvising.
