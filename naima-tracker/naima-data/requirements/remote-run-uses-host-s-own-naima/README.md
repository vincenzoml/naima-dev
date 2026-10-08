# A remote run uses the host's own Naima over ssh, and a tracked file it changes there fails the run

Specification: specs/long-work-naima-run-wait-run-list, section 4.

Checked by: with a host declared, `naima run --host` reaches the host through one non-interactive ssh call that runs the host's own Naima in the host's directory with --guard-tracked, every word quoted; wait, status, list, stop and clean are asked of the host the same way; a guarded run that modifies a tracked file is reported failed, naming the file, whatever its exit code.
