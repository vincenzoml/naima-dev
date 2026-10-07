# Claims outlive their work

Seen in VoxLogicA-2-clean, 2026-10-07: 25 claim files of branches already merged into main (their todos done) were still listed by `naima claims`, so the owner saw a long list of work "waiting since hours". Each worker claimed on its branch; the claim file travelled to main with the merge; nothing released it. Workers were told to release at the end and several did not; others claimed items they then marked done.

Removed by hand (one `git rm` per merged branch, VoxLogicA-2-clean 1e1c1d0a).

Expected: a claim ends when its branch is merged (the merge commit is on the trunk) or when every claimed item is done; `naima check` warns on a claim whose branch is merged or whose items are all closed, and `naima claims` hides or marks them; ideally the merge itself drops the file (a merge hook, or `naima merge`).
