# naima run list shows every run against its budgets, and marks stale and lost runs

Specification: specs/long-work-naima-run-wait-run-list, sections 2 and 3 (naima run list, status).

Checked by: `naima run list` names each run with its reported state, elapsed time against its time budget and size against its disk budget, and the last progress line; a run whose log and progress have not changed for --stale is marked stale; a record with no end and an old heartbeat is marked lost.

Why: in the incident of 2026-10-07 in VoxLogicA-2-clean (specification §0), the owner saw 13 loops as "tasks running" and could not tell live work from dead waits; a hung remote run looked the same as a working one (design choice 2; §2's stale and lost).
