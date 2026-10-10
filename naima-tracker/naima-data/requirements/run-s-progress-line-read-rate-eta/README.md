# A run's progress line is read with its rate and ETA by naima run status, run list and wait, here and on a host

Specification: specs/progress-long-work-says-how-far, sections 2, 3 and 5.

Checked by: a run whose command writes structured lines to $NAIMA_RUN_PROGRESS is shown by run status, run list and wait with its stage, done of total and percentage, a rate and an ETA, and its JSON view carries stage, done, total, unit, rate and etaMs; the overall count is read the same way; a free-text line is shown quoted; while waiting, wait prints the progress line to standard error at --report; a host's view carries the same fields through.

Why: a progress file nobody reads into a rate or an ETA leaves the owner to compute them by hand, or not at all (specification §0).
