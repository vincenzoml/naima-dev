# A plugin declares the external tools it needs; Naima reports them per machine and installs them with the owner's consent

## What the owner asked

Formal-methods tools (mCRL2, Storm, PRISM) are reached through plugins and
should be presented as plugins; agents may write new plugins where one fits;
Naima should be able to install the tools a plugin needs on the machines
where the work runs, when the work needs them. Before any code, the feature
is discussed and specified: Naima is meant to be an exemplar of well
specified software, and a paper describes its features.

## Today

`verifier-mcrl2` names the programs it starts (`runs`) and a `bin` option;
a missing tool is an error run beginning `tool missing:`. Nothing says which
version is needed, nothing checks a machine ahead of the work, nothing
installs.

## Open for the specification

What a tool declaration holds (detection, version range, install recipes per
platform, size and licence for the consent), which machines (this one only,
or remote machines declared in `naima.json`), how consent is asked and
recorded, how the launcher's permissions grow for an install and only for
it, how an installed tool's version enters the evidence.

## Before building

Requirements and a current specification in this tracker
(todos/specify-naima-itself-requirements-current-specification-core).
