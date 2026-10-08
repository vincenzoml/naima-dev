# naima run clean removes only what the run declared it creates: never a tracked file, never while it runs

Specification: specs/long-work-naima-run-wait-run-list, section 3 (naima run, 1; naima run clean).

Checked by: after a run ends, `naima run clean` removes its declared paths and its record and nothing else; it is refused while the run is running; a --creates path holding a tracked file, the repository root or a directory above it is refused at start and again at clean.
