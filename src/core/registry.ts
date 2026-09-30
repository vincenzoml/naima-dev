// Merging plugin manifests into one registry.
//
// Every contribution has a qualified id, `<plugin>/<name>`, unique whatever
// other plugins declare, and a short name it goes by: its declared name, or
// the one the project's `rename` gives it. A short name works while it stays
// unambiguous. A kind whose names are written into the data — a type, a
// field, a relation, a directory, a gate, a verifier — cannot have two
// contributions by one name, since both would be stored under it: that is an
// error at load time, resolved by renaming one. Any other kind may share a
// short name; it then stops resolving, and the qualified id names each.

import { FrozenMap, FrozenSet } from "./collections.ts"
import { inOrder } from "./format.ts"
import type {
  Check,
  Command,
  Contribution,
  FieldDef,
  GateDef,
  Plugin,
  RankTerm,
  Registry,
  RelationDef,
  Severity,
  SummarySection,
  TypeDef,
  Verifier,
  View,
} from "./types.ts"

export interface RegistryOptions {
  /** Command names the entry point answers before any plugin is loaded: a plugin command by one of them could never run. */
  reserved?: string[]
  /** The severity the project gives a plugin's checks: plugin name → check name → severity. A check set off is not run. */
  severities?: Record<string, Record<string, Severity>>
  /** The project's renames: kind → qualified id → the short name it goes by instead. */
  rename?: Record<string, Record<string, string>>
  /** Plugins that read their own names as declared, so none of their contributions can be renamed: the core's and the first-party ones. */
  fixedNames?: string[]
}

/** A kind of contribution: where a manifest declares it, what names one, how a renamed copy is made. */
interface Kind<T> {
  id: string
  noun: string
  /** Its names are written into the data: two contributions may not share one. */
  stored: boolean
  of(p: Plugin): readonly T[] | undefined
  name(c: T): string
  renamed(c: T, name: string): T
}

const kind = <T>(k: Kind<T>): Kind<T> => k
const named = <T extends { name: string }>(id: string, noun: string, stored: boolean, of: (p: Plugin) => readonly T[] | undefined): Kind<T> =>
  kind({ id, noun, stored, of, name: (c) => c.name, renamed: (c, name) => ({ ...c, name }) })

/** Every kind of contribution, in the order they are merged. */
export const KINDS = {
  types: kind<TypeDef>({ id: "types", noun: "type", stored: true, of: (p) => p.types, name: (t) => t.id, renamed: (t, id) => ({ ...t, id, dir: id }) }),
  fields: named<FieldDef>("fields", "field", true, (p) => p.fields),
  relations: named<RelationDef>("relations", "relation", true, (p) => p.relations),
  dirs: kind<string>({ id: "dirs", noun: "directory", stored: true, of: (p) => p.dirs, name: (d) => d, renamed: (_d, name) => name }),
  gates: named<GateDef>("gates", "gate", true, (p) => p.gates),
  verifiers: kind<Verifier>({ id: "verifiers", noun: "verifier", stored: true, of: (p) => p.verifiers, name: (v) => v.id, renamed: (v, id) => ({ ...v, id }) }),
  commands: named<Command>("commands", "command", false, (p) => p.commands),
  views: named<View>("views", "view", false, (p) => p.views),
  checks: named<Check>("checks", "check", false, (p) => p.checks),
  summary: named<SummarySection>("summary", "summary section", false, (p) => p.summary),
  rank: named<RankTerm>("rank", "rank term", false, (p) => p.rank),
} as const

type Kinds = typeof KINDS
type ValueOf<K extends keyof Kinds> = Kinds[K] extends Kind<infer T> ? T : never

/** A check as the project weighs it: every finding at `level`. */
const weighed = (check: Check, level: Exclude<Severity, "off">): Check => ({
  ...check,
  run: (ctx) => check.run(ctx).map((f) => ({ ...f, level })),
})

const quote = (c: Contribution): string => `"${c.plugin}" (${c.id})`

/** Why `ref` names none, or several, of `list`; the one it names. `ref` is a qualified id, or a short name no other contribution shares. */
function lookup<T>(list: readonly Contribution<T>[], noun: string, ref: string): Contribution<T> | undefined {
  if (ref.includes("/")) return list.find((c) => c.id === ref)
  const found = list.filter((c) => c.name === ref)
  if (found.length > 1) throw new Error(`${noun} "${ref}" is ambiguous: ${found.map((c) => c.id).join(", ")} — name one by its qualified id`)
  return found[0]
}

export function buildRegistry(plugins: Plugin[], opts: RegistryOptions = {}): Registry {
  const rename = opts.rename ?? {}
  const fixed = new Set(opts.fixedNames ?? [])
  const names = new Set<string>()
  for (const p of plugins) {
    if (names.has(p.name)) throw new Error(`plugin "${p.name}" is loaded twice`)
    names.add(p.name)
    inOrder({ plugin: p.name, migrations: p.migrations ?? [] })
  }

  /** Every contribution of kind `k`, named as the project names it; a name stored twice is an error naming both. */
  const collect = <K extends keyof Kinds>(key: K): Contribution<ValueOf<K>>[] => {
    const k = KINDS[key] as unknown as Kind<ValueOf<K>>
    const out: Contribution<ValueOf<K>>[] = []
    for (const p of plugins) {
      for (const c of k.of(p) ?? []) {
        const declared = k.name(c)
        const id = `${p.name}/${declared}`
        if (out.some((o) => o.id === id)) throw new Error(`${k.noun} "${declared}" is declared twice by "${p.name}"`)
        const to = rename[k.id]?.[id]
        const name = to ?? declared
        const clash = out.find((o) => o.name === name)
        if (clash && k.stored) {
          throw new Error(
            `${k.noun} "${name}" is declared by both ${
              quote(clash)
            } and "${p.name}" (${id}), and both would be stored as "${name}" — rename one in naima.json: "rename": { "${k.id}": { "${id}": "<another name>" } }`,
          )
        }
        out.push(Object.freeze({ id, name, plugin: p.name, value: to === undefined ? c : k.renamed(c, to) }))
      }
    }
    return out
  }

  // The project's renames must each name a contribution a plugin that reads its names through its scope declares.
  for (const [k, table] of Object.entries(rename)) {
    const known = Object.hasOwn(KINDS, k) ? KINDS[k as keyof Kinds] : undefined
    if (!known) throw new Error(`rename.${k}: not a kind of contribution — kinds: ${Object.keys(KINDS).join(", ")}`)
    for (const [id, to] of Object.entries(table)) {
      const [plugin = "", ...rest] = id.split("/")
      const declared = rest.join("/")
      const owner = plugins.find((p) => p.name === plugin)
      if (!owner || !(known.of(owner) as readonly unknown[] | undefined ?? []).some((c) => (known.name as (c: unknown) => string)(c) === declared)) {
        throw new Error(`rename.${k}: "${id}" is no ${known.noun} a loaded plugin declares — a qualified id is <plugin>/<name>`)
      }
      if (fixed.has(plugin)) throw new Error(`rename.${k}: "${id}" is ${plugin}'s, which reads its own names as declared — rename the other plugin's instead`)
      if (!/^[^\s/]+$/.test(to)) throw new Error(`rename.${k}.${id}: "${to}" is not a name — no spaces, no /`)
    }
  }

  const all = Object.fromEntries(Object.keys(KINDS).map((k) => [k, collect(k as keyof Kinds)])) as { [K in keyof Kinds]: Contribution<ValueOf<K>>[] }
  const ownName = (kindId: string, plugin: string, declared: string): string => rename[kindId]?.[`${plugin}/${declared}`] ?? declared

  // A type's directory is a stored name like any other: a type's and a plugin's directory may not coincide.
  const dirs = new Map<string, string>()
  const claim = (dir: string, by: string): void => {
    const previous = dirs.get(dir)
    if (previous !== undefined) throw new Error(`directory "${dir}" is claimed by both ${previous} and ${by}`)
    dirs.set(dir, by)
  }
  const types = new Map<string, TypeDef>()
  for (const { value: t, id } of all.types) {
    if (!Object.hasOwn(t.statuses, t.initialStatus)) throw new Error(`type "${t.id}": initial status "${t.initialStatus}" is not one of its statuses`)
    types.set(t.id, t)
    claim(t.dir, `type ${id}`)
  }
  for (const { name, id } of all.dirs) claim(name, id)

  /** A type another contribution names: its own plugin's by declared name, a qualified id, or a short name. */
  const typeRef = (plugin: string, ref: string): string | undefined => {
    const own = all.types.find((c) => c.plugin === plugin && c.id === `${plugin}/${ref}`)
    return own ? own.name : lookup(all.types, "type", ref)?.name
  }
  const fields = new Map<string, FieldDef>()
  for (const { value: f, plugin } of all.fields) {
    const appliesTo = f.appliesTo?.map((t) => {
      const id = typeRef(plugin, t)
      if (id === undefined) throw new Error(`field "${f.name}" applies to type "${t}", which no plugin declares`)
      return id
    })
    fields.set(f.name, appliesTo && appliesTo.some((t, i) => t !== f.appliesTo?.[i]) ? { ...f, appliesTo } : f)
  }
  const relations = new Map<string, RelationDef>()
  for (const { value: r, plugin } of all.relations) {
    const inverse = ownName("relations", plugin, r.inverse)
    relations.set(r.name, inverse === r.inverse ? r : { ...r, inverse })
  }
  for (const r of relations.values()) {
    if (!relations.has(r.inverse)) throw new Error(`relation "${r.name}" names inverse "${r.inverse}", which is not declared`)
  }

  const reserved = new Set(opts.reserved ?? [])
  for (const c of all.commands) {
    if (reserved.has(c.name)) {
      throw new Error(`command "${c.name}" is answered by the entry point before any plugin loads, so "${c.plugin}" can never run it — rename it`)
    }
  }

  // Weighed as the project says; a check it switches off is not run, and a check it names must exist.
  for (const p of plugins) {
    const levels = opts.severities?.[p.name] ?? {}
    for (const name of Object.keys(levels)) {
      if (!(p.checks ?? []).some((c) => c.name === name)) {
        throw new Error(
          `plugins.${p.name}.checks names "${name}", which ${p.name} does not declare — its checks: ${
            (p.checks ?? []).map((c) => c.name).join(", ") || "none"
          }`,
        )
      }
    }
  }
  const checks = all.checks.flatMap((c): Check[] => {
    const levels = opts.severities?.[c.plugin] ?? {}
    const declared = c.id.slice(c.plugin.length + 1)
    const level = Object.hasOwn(levels, declared) ? levels[declared] : undefined
    return level === "off" ? [] : [level ? weighed(c.value, level) : c.value]
  })

  const byKind = new FrozenMap<string, readonly Contribution[]>(
    Object.entries(all).map(([k, list]) => [k, Object.freeze([...list]) as readonly Contribution[]]),
  )
  /** By the name a person invokes it by: its short name, or its qualified id while the short name is shared. */
  const invoked = <T>(list: readonly Contribution<T>[]) =>
    new FrozenMap(list.map((c) => [list.some((o) => o !== c && o.name === c.name) ? c.id : c.name, c.value] as const))
  return Object.freeze({
    plugins: Object.freeze([...plugins]),
    types: new FrozenMap(types),
    fields: new FrozenMap(fields),
    relations: new FrozenMap(relations),
    dirs: new FrozenSet(dirs.keys()),
    checks: Object.freeze(checks),
    commands: invoked(all.commands),
    views: invoked(all.views),
    summary: Object.freeze(all.summary.map((c) => c.value)),
    rank: Object.freeze(all.rank.map((c) => c.value)),
    gates: new FrozenMap(all.gates.map((c) => [c.name, c.value] as const)),
    verifiers: new FrozenMap(all.verifiers.map((c) => [c.name, c.value] as const)),
    contributions: (k: string) => byKind.get(k) ?? [],
    find<T>(k: string, ref: string): Contribution<T> | undefined {
      const noun = Object.hasOwn(KINDS, k) ? KINDS[k as keyof Kinds].noun : k
      return lookup(byKind.get(k) ?? [], noun, ref) as Contribution<T> | undefined
    },
  })
}
