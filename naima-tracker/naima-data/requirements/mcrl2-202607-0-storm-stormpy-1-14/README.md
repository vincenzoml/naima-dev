# mCRL2 202607.0 and Storm (stormpy 1.14.0, on a shipped Python) are declared for every platform that has an artefact, and each platform without one has a plain answer

Specification: specs/tools-plugin-declares-tools-needs-naima-tools, section 8.

Checked by: the declarations name the release artefacts with their published sizes and sha256 for macOS arm64 and x86_64, Linux x86_64 (the unpacked .deb) and Windows x86_64 for mCRL2, and macOS and Linux for Storm; Linux arm64 for mCRL2 and Windows for Storm carry their answers; a real install of both on a macOS machine, into a scratch directory, verified.

Why: the owner's first tools (§8), and the decision that what Naima can ship it ships, saying plainly what it cannot.
