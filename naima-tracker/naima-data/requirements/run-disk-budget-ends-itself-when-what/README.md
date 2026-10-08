# A run with a disk budget ends itself when what it declared it creates outgrows the budget

Specification: specs/long-work-naima-run-wait-run-list, section 3 (naima run, 1, 5).

Checked by: --budget-disk without --creates is refused; a command that writes 2 MiB into its declared directory under a 1 MiB budget is ended, reported killed with reason budget-disk, with its peak size recorded.

Why: in the incident of 2026-10-07 in VoxLogicA-2-clean (specification §0), an agent filled the disk of the measurement server fmt-5000 to 100% with stores it created and never removed (design choice 5).
