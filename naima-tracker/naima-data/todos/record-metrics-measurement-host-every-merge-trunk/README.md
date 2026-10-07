# Record metrics on a measurement host for every merge to the trunk, and let backfill's copy see named untracked data

`metrics run --record` records where the commit is checked out. VoxLogicA-2's method records its timed metrics on one measurement host (fmt-5000) for every merge to main: today someone pulls there, runs, commits the record and pushes it, by hand; a merge missed stays a gap.

- [ ] A way to record every first-parent commit of the trunk on a named host not yet recorded there (a `metrics record --since`/watch mode on that host), committing or exporting the records so the trunk gets them.
- [ ] `metrics backfill` runs a command metric in a temporary copy of the repository, which lacks untracked data the command needs (VoxLogicA-2: `tools/bench/data/` links to datasets, a built Python environment). Let a metric or the project name untracked paths to link into the copy, or run in a detached worktree beside the checkout.

Done when a merge to VoxLogicA-2's main is recorded on fmt-5000 without a person, and a missed one is backfilled there.
