# naima wait finds a run by its record, never by a process pattern, is bounded by a timeout, and prints the exit status and the log's tail

Specification: specs/long-work-naima-run-wait-run-list, sections 2 and 3 (naima wait).

Checked by: `naima wait` returns 0 and prints the exit code and the log's tail for a run that succeeded, 1 for one that failed, 1 with "still running" at its --timeout for one that has not ended, 2 for an unknown name; the plugin's source starts no process-table search (no pgrep, ps or pattern match on command lines).

Why: in the incident of 2026-10-07 in VoxLogicA-2-clean (specification §0), `until ! pgrep -f "naima.ts metrics"; do sleep 30; done` matched its own command line and never ended; a wait must be by identity, and must end (design choices 2 and 7).
