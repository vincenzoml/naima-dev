# A property cannot be verified on a declared host

The long-work plugin makes every remote run `--guard-tracked`: a tracked file
it changes fails it. `naima verify` writes the item it verifies (meta.json, the
attached run), so `naima run v --host h -- naima verify <property>` can only
fail, and there is no `naima verify --host`. Heavy model checks — the reason a
host is declared — therefore run on the host by hand, in a clone there, and
come back as commits.

Seen on 2026-10-09 moving VoxLogicA-2-clean's model checks to sleipnir (fmt-5000
unreachable): the verifications were started on sleipnir directly, and the
results committed there and pushed back.

Also: `naima verify` takes no extra arguments for the tools (mCRL2's `-v`,
`--timings`), so a check that runs for hours has no progress or timing record;
the two longest checks were run by hand with the same pipeline to get them.

Expected: `naima verify --host <h>` (or a guarded run that brings its item
changes back as a patch or a branch), and a way to pass tool flags that do not
change the verdict, recorded with the run.
