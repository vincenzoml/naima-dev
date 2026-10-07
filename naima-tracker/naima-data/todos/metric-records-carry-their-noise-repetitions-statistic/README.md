# Metric records carry their noise: repetitions, statistic and spread, and a tolerance checked against the measured spread

A record holds one number per metric. VoxLogicA-2's timed metrics are the median (or minimum) of 3-5 repetitions taken by its own driver; the spread between repetitions is lost to Naima, so a metric's `tolerance` is set by hand (its rule: at least the spread measured between identical runs, 5% until measured) and nothing checks it.

- [ ] A metric's command may report its repetitions, the statistic used and the spread (min-max or a deviation) beside the value; the record keeps them.
- [ ] `metrics run` reports a change inside the measured spread as no change, and `naima check` notes a tolerance below the spread last measured.
- [ ] Optionally Naima repeats a cheap metric n times itself and takes the statistic.

(The analysis UI todo, metric-analysis-ui-per-metric-timeline-across, draws the spread; this one records it.) Done when VoxLogicA-2's records carry their spread and its tolerance rule is checked by Naima.
