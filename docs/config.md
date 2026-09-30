# Configuration

## The automatic principle

Naima is automatic, not configured. Every first-party plugin — `trackers`,
`coordination`, `triage`, `gates`, `beta-markers`, `verifier`, `docs` — is
always loaded, and every default is inferred from the repository: beta
markers are looked for in every file git tracks (or would track), and the
docs check follows the links of every tracked markdown file. The program in
`naima-tracker/naima/` is never one of the project's files, even when it is
committed. There is no list of plugins to switch on, and no option to set for
a plugin to cover the project.

`naima-tracker/naima-data/naima.json` holds only what the tool cannot infer:

- the **format** of the data, and the **lock**: which Naima runs the project
  (`source`, `commit`, optionally `verify`), and how it is carried (`carry`, `program`);
- the project's **gates**, because a release condition is a decision;
- **third-party plugins**, which are added, never switched on.

`naima init` writes the format and the lock; nothing else is needed. Every
key, with its default: [the format](format.md#naimajson).

## Gates

`gates` maps a gate name to `{ "title", "says", "holdsOn" }`. How a gate
decides is in the [reference](reference.md#gates).

## Third-party plugins

Code runs only from the program, never from the data or from a package. A
third-party plugin is a module inside the program — in practice, in a fork of
Naima ([modifying Naima](install.md#modifying-naima)) — named by its path
there, with optional options:

```json
{ "plugins": ["plugins/mine.ts", { "name": "plugins/other.ts", "options": { "strict": true } }] }
```

A path that leaves the program is refused, and so is a first-party name: it
is already loaded. The module's default export is a factory that takes the
options and returns the manifest ([plugin contract](plugin-contract.md)). Two
plugins declaring the same name is an error when the project loads.
