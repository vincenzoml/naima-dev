# Every run has a time budget, and the run ends itself, whole process group included, when it runs out

Specification: specs/long-work-naima-run-wait-run-list, section 3 (naima run, 1, 5–7).

Checked by: `naima run` without --budget-time is refused; a command that would run 60 s under a 2 s budget is ended within a few check intervals, reported killed with reason budget-time, and no process of its group — a background child included — is left running.
