# Use the state-of-the-art method for the job, never an ad-hoc script, hack or regular expression where a proper tool exists

Every action is done with the state-of-the-art method for it: a real parser for a language, a
library made for the format, the tool built for the job. An ad-hoc script, a hack or a regular
expression is used only where it is genuinely the right tool — a flat, regular pattern with no
nesting — and never as a stand-in for parsing a structured language such as markdown, HTML,
JSON, YAML or source code.

Why: a check built on regular expressions over markdown reported 168 working links as broken in
one project, because it could not see HTML anchors; a check that is wrong in that way teaches
everyone to ignore it, and then the real defects it was written to find go unseen.
