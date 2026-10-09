# A plugin declares each tool it needs with an exact version, a licence, a check, and per platform a source with size and sha256 or an answer saying why there is none

Specification: specs/tools-plugin-declares-tools-needs-naima-tools, section 1.

Checked by: a declaration lacking its version, licence, verify, or a source lacking url, size or sha256, is refused when the plugin loads, naming the plugin and the key; the shipped declarations (mcrl2, python, storm) load.

Why: the feature's ask: nothing said which version a plugin needs, so nothing could check a machine ahead of the work (§0).
