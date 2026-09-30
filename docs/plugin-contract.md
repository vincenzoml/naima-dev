# Plugin contract

The interfaces are in [`src/core/types.ts`](../src/core/types.ts); this page
says what each part is for.

## Shape

```ts
import type { Plugin } from "../src/core/index.ts"   // a path inside the program

export default function myPlugin(options: Record<string, unknown>): Plugin {
  return { name: "my-plugin", says: "one line", /* contributions */ }
}
```

The first-party plugins are always loaded. A third-party plugin is added
under `plugins` in `naima.json`, by its path inside the program — a fork of
Naima that carries it — with optional `options` ([configuration](config.md)):

```json
{ "plugins": [{ "name": "plugins/mine.ts", "options": {} }] }
```

## Contributions

| Part | What it declares |
|---|---|
| `says` | one line: what the plugin is (required) |
| `about` | longer markdown: the concepts a reader needs before the reference |
| `options` | the keys the plugin reads from its `options`: `name`, `says`, `default` (a first-party plugin infers each default from the repository) |
| `types` | item types: `id`, `dir`, `statuses` (each `open` or `done`, optionally `proves`), `initialStatus`, a README `template`, `creatable: false` for archives |
| `fields` | fields with a kind (`string`, `strings`, `date`, `enum`, `boolean`, `number`), enum values in rank order, and the types they apply to |
| `relations` | link relations; each names its inverse, which must also be declared |
| `dirs` | directories under the tracker root the plugin owns that are not item types |
| `checks` | `run(ctx) → Finding[]`; `problem` fails `naima check`, `note` does not |
| `commands` | `naima <name>`: `says`, `usage`, `options` (one per `--flag` in the usage), `examples` (invocations without the leading `naima`); `run(args, ctx)` returns an exit code (may be async) |
| `views` | `naima view <name>`: a named rendering of derived state |
| `summary` | a block of `naima summary` |
| `rank` | an additive urgency term; lower is more urgent |
| `gates` | a named condition: `title`, `says`, `decides` (how it decides, in words), `evaluate(ctx) → { holds, blocking, owed }` |
| `verifiers` | an adapter to a formal-methods tool: `verify({ model, property, options }) → { verdict, output, counterexample? }` |

Every name — type, directory, field, relation, command, view, gate, verifier,
check, summary section, rank term — is global. Declaring one twice is an
error when the project loads. So is a command named after one the entry point
answers before any plugin loads (`init`, `update`, `carry`, `guide`, `help`):
it could never run.

**Documentation is part of the manifest.** Every `says`, every example and
every option entry is what `naima docs` turns into the reference, and with the
`docs` plugin loaded `naima check` fails on a contribution that lacks its own:
[the documentation rule](documentation.md).

## The context

Every hook receives a `Context`: the project `root`, the data directory
`trackerRoot` and its path from the root `trackerDir`, the `program` directory
(never part of the project's files: pass it to `projectFiles`), the
`config`, the merged `registry`, the `repo` (items, `byId`, `resolve`,
`linksOf` with inverses), `reload()` for a change made on disk without the
helpers, `out`/`err`, and `now()`. Write through the public helpers
(`createItem`, `saveMeta`, `setFields`, `addLink`, `moveItem`, `writeJson`) so
that ids and validation stay consistent: every write through them is seen by
the next read of `repo`, with no reload to remember. The `registry` and the
`config` are frozen once the project is loaded: a plugin reads another's
contributions and cannot change them.

## Cooperation without imports

Plugins do not import each other. They cooperate through what they declare:
the `trackers` plugin's `close` accepts any item whose status `proves`, so a
`verifier` property that holds closes a bug exactly as a passed test does; the
`gates` plugin lists every gate in the registry, including the verifier's
`properties` gate; `triage` and `gates` each add a `rank` term and the core
sums them.

## The verifier contract

A verifier is an adapter to a formal-methods tool (a model checker, a
theorem prover, a spatial logic checker):

```ts
const myChecker: Verifier = {
  id: "my-checker",
  says: "what it checks, in one line",
  async verify({ model, property, options }, ctx) {
    // model: absolute path of the model file; property: in the tool's own language;
    // options: the item's `verifierOptions` object.
    return { verdict: "holds", output: "…", /* counterexample: "…" */ }
  },
}
```

| Verdict | Item status | Meaning |
|---|---|---|
| `holds` | `holds` (proves) | the property holds on this model |
| `violated` | `violated` | the tool found a counterexample; return it as `counterexample` |
| `error` | `error` | the tool could not run or reach a verdict |
| `unknown` | `error` | the tool ran and could not decide (a bound was hit) |

An adapter that throws is recorded as `error` with the message as output.
Map the tool's exit status and output to a verdict; never report `holds` on
a run that did not complete.

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
