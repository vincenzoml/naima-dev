# naima tools remove removes a tool's directory, and refuses one another installed tool needs

Specification: specs/tools-plugin-declares-tools-needs-naima-tools, section 6.

Checked by: removing an installed tool removes <dir>/<tool>/ and reports it; removing the python under an installed storm refuses, naming storm; removing what is not installed says so and exits 0.

Why: a removal that breaks another tool's install would turn a cleanup into a broken verifier (§6).
