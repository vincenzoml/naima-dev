# An install checks the download's size and sha256 against the declaration and leaves nothing installed when either differs

Specification: specs/tools-plugin-declares-tools-needs-naima-tools, section 4.

Checked by: a fixture served with a wrong sha256, and one with a wrong size, each stop the install naming what differed; the tools directory holds no tool and no staging directory afterwards.

Why: a replaced or truncated artefact must never become the tool a proof is made with (§9, choice 2).
