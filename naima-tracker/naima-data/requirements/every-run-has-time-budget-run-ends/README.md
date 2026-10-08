# Every run has a time budget, and the run ends itself, whole process group included, when it runs out

Specification: specs/long-work-naima-run-wait-run-list, section 3 (naima run, 1, 5–7).

Checked by: `naima run` without --budget-time is refused; a command that would run 60 s under a 2 s budget is ended within a few check intervals, reported killed with reason budget-time, and no process of its group — a background child included — is left running.

Why: in the incident of 2026-10-07 in VoxLogicA-2-clean (specification §0), 13 wait loops ran for up to 10.5 hours and a remote run hung for hours with nothing to end it. Nothing that runs unattended may run unbounded (design choices 4 and 13).
