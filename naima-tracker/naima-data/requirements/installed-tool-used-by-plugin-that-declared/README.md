# An installed tool is used by the plugin that declared it without PATH, and the launcher grants its programs and only naima tools the rights to install

Specification: specs/tools-plugin-declares-tools-needs-naima-tools, section 5.

Checked by: with mcrl2 installed, the mCRL2 verifier's programs are the installed absolute paths, its bin option still wins, and PATH is the fallback; the launcher grants naima tools write on the directory, the network and running, and no other command any of these; every command may read the directory.

Why: a tool installed but not used would leave the verifier failing with tool missing: (§0, §5).
