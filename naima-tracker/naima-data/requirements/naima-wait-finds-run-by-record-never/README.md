# naima wait finds a run by its record, never by a process pattern, is bounded by a timeout, and prints the exit status and the log's tail

Specification: specs/long-work-naima-run-wait-run-list, sections 2 and 3 (naima wait).

Checked by: `naima wait` returns 0 and prints the exit code and the log's tail for a run that succeeded, 1 for one that failed, 1 with "still running" at its --timeout for one that has not ended, 2 for an unknown name; the plugin's source starts no process-table search (no pgrep, ps or pattern match on command lines).
