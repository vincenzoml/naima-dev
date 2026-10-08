# A remote run uses the host's own Naima over ssh, and a tracked file it changes there fails the run

Specification: specs/long-work-naima-run-wait-run-list, section 4.

Checked by: with a host declared, `naima run --host` reaches the host through one non-interactive ssh call that runs the host's own Naima in the host's directory with --guard-tracked, every word quoted; wait, status, list, stop and clean are asked of the host the same way; a guarded run that modifies a tracked file is reported failed, naming the file, whatever its exit code.

Why: in the incident of 2026-10-07 in VoxLogicA-2-clean (specification §0), the long runs were on a remote measurement server, polled by hand over ssh; and the project's rule is never to edit tracked files over ssh (design choice 6; §4).
