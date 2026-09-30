# Documentation

| Page | What it holds |
|---|---|
| [Concepts](concepts.md) | items, links, fixed / resolved / closed, derived state, cross-branch coordination |
| [Using Naima in your project](using-naima.md) | install it anywhere, `naima init`, the `naima/` directory, the pin |
| [The Naima skill](skill.md) | the agent skill: what it teaches, how an agent loads it |
| [Configuration](config.md) | the automatic principle, and `naima/config.json`: the pin, gates, third-party plugins |
| [Reference](reference.md) | **generated**: every command with its options and examples, every item type and status, field, link relation, check, gate and how it decides, view, verifier, and every plugin with its options |
| [Plugin contract](plugin-contract.md) | writing a plugin: the manifest, the context, the verifier contract, testing |
| [Architecture](architecture.md) | the source layout, the tracker on disk, the dependency rule |
| [The documentation rule](documentation.md) | every feature documented as part of its implementation, and how `naima check` holds it |
| [Bootstrap policy](bootstrap.md) | how this repository's own tracker is managed by the previous stable Naima, through the pin |
| [Flows](flows/README.md) | procedures for people and AI agents: coordinator and workers, worktrees, merges, reporting |

The reference is generated from the plugin manifests by `naima docs`, so it
cannot drift from the code: in this repository `npm run docs` rewrites it and
`npm run verify` fails when it is out of date or when anything loaded is
undocumented.
