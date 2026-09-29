# Plugin contract

The interfaces are in [`src/core/types.ts`](../src/core/types.ts); this page
says what each part is for.

## Shape

```ts
import type { Plugin } from "naima/core"   // in-tree: "../../core/index.ts"

export default function myPlugin(options: Record<string, unknown>): Plugin {
  return { name: "my-plugin", says: "one line", /* contributions */ }
}
```

Listed in `naima.config.json` by built-in name, by a path relative to the
project root, or by package name, with optional `options`:

```json
{ "trackerDir": "tracker", "plugins": ["trackers", { "name": "./tools/mine.mjs", "options": {} }] }
```

## Contributions

| Part | What it declares |
|---|---|
| `types` | item types: `id`, `dir`, `statuses` (each `open` or `done`, optionally `proves`), `initialStatus`, a README `template`, `creatable: false` for archives |
| `fields` | fields with a kind (`string`, `strings`, `date`, `enum`, `boolean`, `number`), enum values in rank order, and the types they apply to |
| `relations` | link relations; each names its inverse, which must also be declared |
| `dirs` | directories under the tracker root the plugin owns that are not item types |
| `checks` | `run(ctx) → Finding[]`; `problem` fails `naima check`, `note` does not |
| `commands` | `naima <name>`; `run(args, ctx)` returns an exit code (may be async) |
| `views` | `naima view <name>`: a named rendering of derived state |
| `summary` | a block of `naima summary` |
| `rank` | an additive urgency term; lower is more urgent |
| `gates` | a named condition: `evaluate(ctx) → { holds, blocking, owed }` |
| `verifiers` | an adapter to a formal-methods tool: `verify({ model, property, options }) → { verdict, output, counterexample? }` |

Every name — type, directory, field, relation, command, view, gate, verifier —
is global. Declaring one twice is an error when the project loads.

## The context

Every hook receives a `Context`: the project `root`, the `trackerRoot`, the
`config`, the merged `registry`, the `repo` (items, `byId`, `resolve`,
`linksOf` with inverses), `reload()` after writing, `out`/`err`, and `now()`.
Write through the public helpers (`createItem`, `saveMeta`, `setFields`,
`addLink`, `moveItem`) so that ids, validation and reloading stay consistent.

## Cooperation without imports

Plugins do not import each other. They cooperate through what they declare:
the `trackers` plugin's `close` accepts any item whose status `proves`, so a
`verifier` property that holds closes a bug exactly as a passed test does; the
`gates` plugin lists every gate in the registry, including the verifier's
`properties` gate; `triage` and `gates` each add a `rank` term and the core
sums them.

## Evidence from a verifier

A `properties` item names `verifier`, `model` (a path from the project root)
and `property`. `naima verify` runs the adapter and attaches the run —
verdict, output, the model's sha256 — plus the counterexample as its own file.
`naima check` fails when a property claims to hold and its model has changed
since the run. The shipped adapter, `example-regex`, is a stand-in; real
adapters are separate plugins.

## Testing a plugin

`core/testing.ts` builds a throwaway project with a fixed clock and captured
output:

```ts
const p = tempProject([myPlugin({})], { git: true })
await p.run("my-command", "arg")
assert.match(p.output.join("\n"), /expected/)
p.cleanup()
```
