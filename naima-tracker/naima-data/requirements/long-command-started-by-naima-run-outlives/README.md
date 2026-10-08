# A long command started by naima run outlives the session that started it, with its log, progress file and record

Specification: specs/long-work-naima-run-wait-run-list, sections 1 and 3 (naima run, 2–4).

Checked by: a run started by `naima run` keeps running after the naima process that started it has exited; its record holds run.json, status.json with the command's pid, the log with the command's output, and the progress file the command wrote through NAIMA_RUN_PROGRESS; the record's directory is ignored by git without any change to the project's own ignore files.
