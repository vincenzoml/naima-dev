# Metric tiers: declare where and when a metric runs (any machine per commit, a measurement host per merge, a gate) and select them in metrics run

A metric cannot say where or when it runs. VoxLogicA-2 (reimplemented metric by metric) has three tiers — cheap metrics on any machine at every commit (test counts, sizes, model states), timed ones only on its measurement host after each merge, runs over ten minutes only at a phase gate — and encodes them outside Naima: its benchmark driver prints `--list --tier <t>` and the agent runs `naima metrics run $(driver --list --tier any) --record`; the gate tier is read from the word "gate tier" in `says`.

- [ ] A metric declares its tier (and the host a timed one needs), validated like its other keys.
- [ ] `naima metrics run --tier <t>` (and backfill, the gate) select by it; on another host a host-bound metric is reported as skipped, not failed.
- [ ] `metrics list` and the board show each metric's tier.

Done when VoxLogicA-2 can drop its driver's tier listing and run `naima metrics run --tier any --record` per commit.
