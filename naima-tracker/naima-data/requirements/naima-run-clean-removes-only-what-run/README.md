# naima run clean removes only what the run declared it creates: never a tracked file, never while it runs

Specification: specs/long-work-naima-run-wait-run-list, section 3 (naima run, 1; naima run clean).

Checked by: after a run ends, `naima run clean` removes its declared paths and its record and nothing else; it is refused while the run is running; a --creates path holding a tracked file, the repository root or a directory above it is refused at start and again at clean.

Why: in the incident of 2026-10-07 in VoxLogicA-2-clean (specification §0), the stores that filled fmt-5000's disk were left behind; cleaning must be one command that removes exactly what was declared, and can never remove the project's own files (design choices 3 and 5).
