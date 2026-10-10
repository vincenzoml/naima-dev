# naima check flags long work declared with neither progress nor a reason why it cannot

Specification: specs/progress-long-work-says-how-far, section 7.

Checked by: the check progress-declared reports a command declared long with neither reports nor cannot-and-instead, a tracked script whose naima run has no --no-progress reason and whose command neither names NAIMA_RUN_PROGRESS nor runs a Naima command that reports, and notes a recorded run silent past its threshold that never wrote progress; a script whose run declares --no-progress with a reason, or whose command writes progress, is not reported.

Why: a rule only enforced by memory is kept until it is forgotten; the check finds long work declared without progress before it runs blind (specification §1).
