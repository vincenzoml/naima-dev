# Long work reports its progress: done of total, rate and ETA, or what it can when it cannot

## The owner's words, restated (2026-10-10)

Every long-running operation reports its progress, unless that is really
impossible. A run started with `naima run` has a progress channel that
`naima run status`, `naima run list` and `naima wait` read and show with a
rate and an ETA, flagging a run that has gone silent; it works on a host too.
Naima's own long commands report progress: `naima verify` each mCRL2 stage,
with the states explored where the tool says them; `naima metrics run` the
metrics done of the total; `naima tools install` the bytes downloaded.
`naima check` flags long work declared with neither progress nor a reason why
it cannot. The rule is a MUST in the rules Naima ships.

## Why

On the VoxLogicA-2 scheduler model, `pbessolve` ran for more than 11 hours on
each of two properties at 10 to 70 BES equations per second, and nothing
showed whether it was moving, how fast, or when it would end; a run that is
silent cannot be told apart from one that hangs.

Specification: specs/progress-long-work-says-how-far.
