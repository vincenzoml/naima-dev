# naima tools reports, for this machine, every declared tool as installed, missing, or unavailable with its answer, and writes nothing

Specification: specs/tools-plugin-declares-tools-needs-naima-tools, section 3.

Checked by: with a declaration installed, one missing, one another version installed and one unavailable on the platform, naima tools and naima tools --json report each state, the platform and the directory, and the command that installs a missing tool; the tools directory is unchanged.

Why: a machine is checked ahead of the work, not discovered missing in the middle of a verification (§0).
