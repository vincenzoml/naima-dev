# naima run on Windows: a run started from an ssh session is lost when the session ends

Seen in VoxLogicA-2-clean on 2026-10-09, on sleipnir (Windows 11 26100, the stock
Windows OpenSSH server, cmd as its shell), Naima 9ca686f, Deno 2.9.7.

`ssh sleipnir "cd … && deno run -A naima-tracker/naima/naima.ts run t1 --budget-time 2m -- ping -n 30 127.0.0.1"`
prints `started`; once that ssh session ends, the supervisor and the command
are gone: `naima run list` reports the run LOST, its log cut after the first
lines. Ten model-checking runs started this way all died the same way. A
`naima run s-hostt --host sleipnir …` from macOS is lost too (`lost — its
supervisor is gone`), so no `--host` run on a Windows host can work.

Cause: Windows OpenSSH puts every process of a session in a job object that
is closed, with all its processes, when the session ends; `spawn(…, {detached:
true})` does not leave the job (it is `DETACHED_PROCESS`, not
`CREATE_BREAKAWAY_FROM_JOB`).

Workaround used: start `naima run` through WMI, whose processes belong to no
such job — PowerShell
`Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "cmd.exe /c deno.exe run -A naima-tracker\naima\naima.ts run <name> …"; CurrentDirectory = "<repo>" }`.
Runs started that way survive and end with their record written.

Expected: on Windows the supervisor outlives the session that started it (WMI
`Win32_Process.Create`, or breakaway from the job when the job allows it), and
a test that starts a run from a child process that is then killed with its job.
