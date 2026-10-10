# A run silent past its threshold is stale; a run declared --no-progress says why and shows its elapsed time and last log line

Specification: specs/progress-long-work-says-how-far, section 4.

Checked by: a run that reports no progress line for longer than --stale is listed STALE even while its log grows; --no-progress with an empty reason is refused; a --no-progress run is judged on its log, and run status, run list and wait show "no progress" with the reason, its elapsed time and the log's last line.

Why: a silent run cannot be told apart from a hung one; where a tool truly has no progress interface, saying so and showing what can be shown is the most that is honest (specification §0, §1).
