# Metric analysis UI

Per the decision that metrics steer through analysis, not commit refusal.

- One view per metric: its value along the commit timeline (main's first
  parent by default, branches selectable), the bound and baseline drawn,
  spread from repeated runs shown.
- **Change points:** the commits where the metric moved beyond its noise
  (tolerance / spread), each linked to its diff, message and the items it
  touched; a gap in recorded commits shown as a range to bisect, with the
  `metrics backfill` command that would fill it.
- **Direction:** which metrics are furthest from their target, which got
  worse since the last release or gate, which bounds a gain has not yet
  followed (ratchet) — the "what to work on next" list.
- Comparison of two commits across every metric.
- Lives in `naima ui` (native window) and as `metrics plot --html`.

Asked by the owner while reimplementing VoxLogicA-2 metric by metric.
