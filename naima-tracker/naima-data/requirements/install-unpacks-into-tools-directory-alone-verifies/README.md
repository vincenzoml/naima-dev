# An install unpacks into the tools directory alone, verifies the tool by running it, and touches neither PATH nor the system; deleting the directory removes every tool

Specification: specs/tools-plugin-declares-tools-needs-naima-tools, section 2.

Checked by: zip, tar.gz, deb, dmg (its hdiutil calls) and pip installs from local fixtures land in <dir>/<tool>/<version>/ with a receipt, after the declared program printed the declared string; a tool that fails its verify is not kept; nothing outside the directory changes, and removing the directory leaves no tool reported installed.

Why: the decision that Naima is portable: a discardable directory, never the system (§2, §4).
