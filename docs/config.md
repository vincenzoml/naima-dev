# Configuration

## The automatic principle

Naima is automatic, not configured. Every first-party plugin — `trackers`,
`coordination`, `triage`, `gates`, `beta-markers`, `verifier`, `docs` — is
always loaded, and every default is inferred from the repository: beta
markers are looked for in every file git tracks (or would track), and the
docs check follows the links of every tracked markdown file. There is no
list of plugins to switch on, and no option to set for a plugin to cover the
project.

The configuration holds only what the tool cannot infer:

- the **pin**: which Naima versions manage the project;
- the project's **gates**, because a release condition is a decision;
- **third-party plugins**, which are added, never switched on.

A project whose configuration is the pin alone works, and that is what
`naima init` writes.

## `naima/config.json`

A project is the directory holding `naima/config.json`; Naima finds it by
walking up from the current directory to the first directory that has one.

```json
{
  "naima": "^0.2.0",
  "gates": {
    "v1": { "title": "First release", "says": "What v1 needs.", "holdsOn": "code" }
  },
  "plugins": [{ "name": "./tools/my-plugin.mjs", "options": {} }]
}
```

| Key | Default | What it is |
|---|---|---|
| `naima` | required | the pin: a semver range of the Naima versions that may manage the project |
| `gates` | `{}` | gate name → `{ "title", "says", "holdsOn" }`; the [reference](reference.md#gates) says how a gate decides |
| `plugins` | `[]` | third-party plugins to add: a path relative to the project root (starting with `.`) or a package name, or `{ "name", "options" }` |

Any other key is an error, and so is a first-party name under `plugins`: it
is already loaded. A third-party module's default export is a factory that
takes the options and returns the manifest ([plugin contract](plugin-contract.md)).
Two plugins declaring the same name is an error when the project loads.

## The pin

`naima` is a semver range: `^0.2.0`, `~0.2.1`, `0.2.x`, `>=0.2.0 <0.4.0`,
alternatives joined by `||`. A Naima whose version is outside it refuses to
act, in one line naming the range to use:

```
naima: naima 0.3.0 does not manage this project: naima/config.json pins naima ^0.2.0 — run npx naima@"^0.2.0"
```

A new format ships in a release first, and a project moves to it by moving its
pin. Naima's own repository is pinned the same way: [bootstrap policy](bootstrap.md).
