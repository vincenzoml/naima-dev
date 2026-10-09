# With --host, naima tools asks the host's own Naima over ssh; an install shows the host's plan and asks the consent here

Specification: specs/tools-plugin-declares-tools-needs-naima-tools, section 7.

Checked by: with a host declared, naima tools --host and naima tools install --host make one non-interactive ssh call each to the host's Naima: the plan from tools show --json, then the install with --consent and --by; the receipt is written on the host.

Why: the work runs where the tools are needed, a measurement server as well as a laptop, and the decision that Naima installs where it runs (§7).
