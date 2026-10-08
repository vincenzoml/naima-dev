# A run with a disk budget ends itself when what it declared it creates outgrows the budget

Specification: specs/long-work-naima-run-wait-run-list, section 3 (naima run, 1, 5).

Checked by: --budget-disk without --creates is refused; a command that writes 2 MiB into its declared directory under a 1 MiB budget is ended, reported killed with reason budget-disk, with its peak size recorded.
