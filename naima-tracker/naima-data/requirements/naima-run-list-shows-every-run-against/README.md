# naima run list shows every run against its budgets, and marks stale and lost runs

Specification: specs/long-work-naima-run-wait-run-list, sections 2 and 3 (naima run list, status).

Checked by: `naima run list` names each run with its reported state, elapsed time against its time budget and size against its disk budget, and the last progress line; a run whose log and progress have not changed for --stale is marked stale; a record with no end and an old heartbeat is marked lost.
