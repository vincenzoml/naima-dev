# Configuration

A project is the directory holding `naima.config.json`; Naima finds it from
the current directory or any directory above. `naima init` writes one with the
default plugins.

```json
{
  "trackerDir": "tracker",
  "plugins": [
    "trackers",
    "coordination",
    "triage",
    { "name": "gates", "options": { "gates": { "v1": { "title": "First release", "says": "What v1 needs.", "holdsOn": "code" } } } },
    { "name": "docs", "options": { "links": ["README.md", "docs"] } },
    { "name": "./tools/my-plugin.mjs", "options": {} }
  ]
}
```

| Key | Default | What it is |
|---|---|---|
| `trackerDir` | `"tracker"` | the tracker directory, relative to the project root |
| `plugins` | required | the plugins to load, in order: a name, or `{ "name", "options" }` |

A plugin name is one of the first-party plugins — `trackers`, `coordination`,
`triage`, `gates`, `beta-markers`, `verifier`, `docs` — or a path relative to
the project root (starting with `.`), or a package name. A module's default
export is a factory that takes the options and returns the manifest
([plugin contract](plugin-contract.md)). The options each first-party plugin
reads are in the [reference](reference.md).

`naima init` loads `trackers`, `coordination`, `triage`, `gates` and `docs`.

Unknown top-level keys are ignored. Loading the same plugin twice, or two
plugins declaring the same name, is an error when the project loads.
