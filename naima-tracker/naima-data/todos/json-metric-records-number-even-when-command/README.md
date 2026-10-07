# A json metric records a number even when its command exits non-zero: no way for a command to say do not record this

Kind `json` reads the command's output whatever its exit status (`readsExit`). VoxLogicA-2's benchmark driver exits 3 for an exploration number taken off its measurement host, meaning "never record this"; read from src/plugins/metrics/index.ts at 549a8bb, Naima would record it whenever the number sat at the metric's `field`. The driver now hides such numbers under another key — a workaround.

- [ ] A documented way for a command to say "no number to record": e.g. kind json honours a non-zero exit unless the metric opts in (`readsExit`-like key), or a reserved field.
- [ ] The guide's kinds table says which kinds read a failing command.

Done when a json metric whose command exits non-zero records nothing unless declared otherwise.
