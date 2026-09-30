// Merging plugin manifests into one registry.
//
// Every kind of contribution is an extension point, declared as data: the
// core's own (core/points.ts) and any a plugin declares. A plugin contributes
// to a point under its id in `contributes`, or under the same key at the top
// of its manifest. Nothing here knows what a point's contributions mean
// beyond the core's own points, whose cross-references it resolves.
//
// Every contribution has a qualified id, `<plugin>/<name>`, unique whatever
// other plugins declare, and a short name it goes by: its declared name, or
// the one the project's `rename` gives it. A short name works while it stays
// unambiguous. A point whose names are written into the data cannot have two
// contributions by one name, since both would be stored under it: that is an
// error at load time, resolved by renaming one. Any other point's names may
// be shared; the short name then stops resolving, and the qualified id names
// each.

import { FrozenMap, FrozenSet } from "./collections.ts"
import { inOrder } from "./format.ts"
import { contributionsOf, migrationsOf } from "./manifest.ts"
import { CORE_POINTS, MANIFEST_KEYS } from "./points.ts"
import type {
  Check,
  Command,
  Contribution,
  ExtensionPoint,
  FieldDef,
  Plugin,
  RankTerm,
  Registry,
  RelationDef,
  Severity,
  SummarySection,
  TypeDef,
  View,
} from "./types.ts"

export interface RegistryOptions {
  /** Command names the entry point answers before any plugin is loaded: a plugin command by one of them could never run. */
  reserved?: string[]
  /** The severity the project gives a plugin's checks: plugin name → check name → severity. A check set off is not run. */
  severities?: Record<string, Record<string, Severity>>
  /** The project's renames: point id → qualified id → the short name it goes by instead. */
  rename?: Record<string, Record<string, string>>
  /** Plugins that read their own names as declared, so none of their contributions can be renamed: the core's and the first-party ones. */
  fixedNames?: string[]
}

/** A check as the project weighs it: every finding at `level`. */
const weighed = (check: Check, level: Exclude<Severity, "off">): Check => ({
  ...check,
  run: (ctx) => check.run(ctx).map((f) => ({ ...f, level })),
})

const quote = (c: Contribution): string => `"${c.plugin}" (${c.id})`

/** The one of `list` that `ref` names: a qualified id, or a short name no other contribution shares. Throws when it is ambiguous. */
function lookup<T>(list: readonly Contribution<T>[], noun: string, ref: string): Contribution<T> | undefined {
  if (ref.includes("/")) return list.find((c) => c.id === ref)
  const found = list.filter((c) => c.name === ref)
  if (found.length > 1) throw new Error(`${noun} "${ref}" is ambiguous: ${found.map((c) => c.id).join(", ")} — name one by its qualified id`)
  return found[0]
}

/** Every point: the core's, then each plugin's in load order. A point declared twice, or by a manifest key's name, is an error. */
function pointsOf(plugins: readonly Plugin[]): Map<string, { point: ExtensionPoint; plugin: string }> {
  const points = new Map<string, { point: ExtensionPoint; plugin: string }>()
  for (const point of CORE_POINTS) points.set(point.id, { point, plugin: "core" })
  for (const p of plugins) {
    for (const point of p.points ?? []) {
      if (typeof point?.id !== "string" || typeof point.key !== "function" || typeof point.noun !== "string") {
        throw new Error(`plugin "${p.name}" declares a point that is not one: an extension point has an id, a noun and a key function`)
      }
      const previous = points.get(point.id)
      if (previous) throw new Error(`extension point "${point.id}" is declared by both "${previous.plugin}" and "${p.name}"`)
      if (MANIFEST_KEYS.includes(point.id)) throw new Error(`plugin "${p.name}": "${point.id}" is a manifest key, so it cannot be an extension point's id`)
      points.set(point.id, { point, plugin: p.name })
    }
  }
  return points
}

export function buildRegistry(plugins: Plugin[], opts: RegistryOptions = {}): Registry {
  const rename = opts.rename ?? {}
  const fixed = new Set(opts.fixedNames ?? [])
  const names = new Set<string>()
  for (const p of plugins) {
    if (names.has(p.name)) throw new Error(`plugin "${p.name}" is loaded twice`)
    names.add(p.name)
  }
  const points = pointsOf(plugins)

  // A manifest says only what the contract knows: its own keys, and the points some loaded plugin declares.
  for (const p of plugins) {
    for (const key of [...Object.keys(p), ...Object.keys(p.contributes ?? {})]) {
      if (MANIFEST_KEYS.includes(key) || points.has(key) || p.optional?.includes(key)) continue
      throw new Error(
        `plugin "${p.name}" contributes to "${key}", which no loaded plugin declares as an extension point — points: ${[...points.keys()].join(", ")}`,
      )
    }
    inOrder({ plugin: p.name, migrations: migrationsOf(p) })
  }

  /** Every contribution to `point`, validated and named as the project names it; a name stored twice is an error naming both. */
  const collect = (point: ExtensionPoint): Contribution[] => {
    const out: Contribution[] = []
    for (const p of plugins) {
      for (const c of contributionsOf(p, point.id)) {
        const why = point.validate?.(c) ?? null
        if (why) throw new Error(`plugin "${p.name}": a ${point.noun} it contributes ${why}`)
        const declared = point.key(c)
        const id = `${p.name}/${declared}`
        if (out.some((o) => o.id === id)) throw new Error(`${point.noun} "${declared}" is declared twice by "${p.name}"`)
        const to = rename[point.id]?.[id]
        const name = to ?? declared
        const clash = out.find((o) => o.name === name)
        if (clash && point.stored) {
          throw new Error(
            `${point.noun} "${name}" is declared by both ${
              quote(clash)
            } and "${p.name}" (${id}), and both would be stored as "${name}" — rename one in naima.json: "rename": { "${point.id}": { "${id}": "<another name>" } }`,
          )
        }
        out.push(Object.freeze({ id, name, plugin: p.name, value: to === undefined || !point.renamed ? c : point.renamed(c, to) }))
      }
    }
    return out
  }

  // The project's renames must each name a contribution, of a point that can rename, by a plugin that reads its names through its scope.
  for (const [k, table] of Object.entries(rename)) {
    const point = points.get(k)?.point
    if (!point) throw new Error(`rename.${k}: not an extension point — points: ${[...points.keys()].join(", ")}`)
    if (!point.renamed) throw new Error(`rename.${k}: a ${point.noun} cannot be renamed`)
    for (const [id, to] of Object.entries(table)) {
      const [plugin = "", ...rest] = id.split("/")
      const owner = plugins.find((p) => p.name === plugin)
      if (!owner || !contributionsOf(owner, k).some((c) => point.key(c) === rest.join("/"))) {
        throw new Error(`rename.${k}: "${id}" is no ${point.noun} a loaded plugin declares — a qualified id is <plugin>/<name>`)
      }
      if (fixed.has(plugin)) throw new Error(`rename.${k}: "${id}" is ${plugin}'s, which reads its own names as declared — rename the other plugin's instead`)
      if (!/^[^\s/]+$/.test(to)) throw new Error(`rename.${k}.${id}: "${to}" is not a name — no spaces, no /`)
    }
  }

  const all = new Map([...points.values()].map(({ point }) => [point.id, collect(point)]))
  const of = <T>(id: string): Contribution<T>[] => (all.get(id) ?? []) as Contribution<T>[]
  const ownName = (point: string, plugin: string, declared: string): string => rename[point]?.[`${plugin}/${declared}`] ?? declared

  // A type's directory is a stored name like any other: a type's and a plugin's directory may not coincide.
  const dirs = new Map<string, string>()
  const claim = (dir: string, by: string): void => {
    const previous = dirs.get(dir)
    if (previous !== undefined) throw new Error(`directory "${dir}" is claimed by both ${previous} and ${by}`)
    dirs.set(dir, by)
  }
  const types = new Map<string, TypeDef>()
  for (const { value: t, id } of of<TypeDef>("types")) {
    if (!Object.hasOwn(t.statuses, t.initialStatus)) throw new Error(`type "${t.id}": initial status "${t.initialStatus}" is not one of its statuses`)
    types.set(t.id, t)
    claim(t.dir, `type ${id}`)
  }
  for (const { name, id } of of<string>("dirs")) claim(name, id)

  /** A type another contribution names: its own plugin's by declared name, a qualified id, or a short name. */
  const typeRef = (plugin: string, ref: string): string | undefined => {
    const own = of<TypeDef>("types").find((c) => c.id === `${plugin}/${ref}`)
    return own ? own.name : lookup(of<TypeDef>("types"), "type", ref)?.name
  }
  const fields = new Map<string, FieldDef>()
  for (const { value: f, plugin } of of<FieldDef>("fields")) {
    const appliesTo = f.appliesTo?.map((t) => {
      const id = typeRef(plugin, t)
      if (id === undefined) throw new Error(`field "${f.name}" applies to type "${t}", which no plugin declares`)
      return id
    })
    fields.set(f.name, appliesTo && appliesTo.some((t, i) => t !== f.appliesTo?.[i]) ? { ...f, appliesTo } : f)
  }
  const relations = new Map<string, RelationDef>()
  for (const { value: r, plugin } of of<RelationDef>("relations")) {
    const inverse = ownName("relations", plugin, r.inverse)
    relations.set(r.name, inverse === r.inverse ? r : { ...r, inverse })
  }
  for (const r of relations.values()) {
    if (!relations.has(r.inverse)) throw new Error(`relation "${r.name}" names inverse "${r.inverse}", which is not declared`)
  }

  const reserved = new Set(opts.reserved ?? [])
  for (const c of of<Command>("commands")) {
    if (reserved.has(c.name)) {
      throw new Error(`command "${c.name}" is answered by the entry point before any plugin loads, so "${c.plugin}" can never run it — rename it`)
    }
  }

  // Weighed as the project says; a check it switches off is not run, and a check it names must exist.
  const declaredChecks = (plugin: string) => of<Check>("checks").filter((c) => c.plugin === plugin).map((c) => c.id.slice(plugin.length + 1))
  for (const [plugin, levels] of Object.entries(opts.severities ?? {})) {
    if (!names.has(plugin)) continue // a plugin switched off: its checks do not run anyway
    for (const name of Object.keys(levels)) {
      if (!declaredChecks(plugin).includes(name)) {
        throw new Error(
          `plugins.${plugin}.checks names "${name}", which ${plugin} does not declare — its checks: ${declaredChecks(plugin).join(", ") || "none"}`,
        )
      }
    }
  }
  const checks = of<Check>("checks").flatMap((c): Check[] => {
    const levels = opts.severities?.[c.plugin] ?? {}
    const declared = c.id.slice(c.plugin.length + 1)
    const level = Object.hasOwn(levels, declared) ? levels[declared] : undefined
    return level === "off" ? [] : [level ? weighed(c.value, level) : c.value]
  })

  const byPoint = new FrozenMap<string, readonly Contribution[]>([...all].map(([k, list]) => [k, Object.freeze([...list])]))
  /** By the name a person invokes it by: its short name, or its qualified id while the short name is shared. */
  const invoked = <T>(list: readonly Contribution<T>[]) =>
    new FrozenMap(list.map((c) => [list.some((o) => o !== c && o.name === c.name) ? c.id : c.name, c.value] as const))
  return Object.freeze({
    plugins: Object.freeze([...plugins]),
    points: new FrozenMap([...points].map(([id, { point }]) => [id, point] as const)),
    types: new FrozenMap(types),
    fields: new FrozenMap(fields),
    relations: new FrozenMap(relations),
    dirs: new FrozenSet(dirs.keys()),
    checks: Object.freeze(checks),
    commands: invoked(of<Command>("commands")),
    views: invoked(of<View>("views")),
    summary: Object.freeze(of<SummarySection>("summary").map((c) => c.value)),
    rank: Object.freeze(of<RankTerm>("rank").map((c) => c.value)),
    contributions: (k: string) => byPoint.get(k) ?? [],
    find<T>(k: string, ref: string): Contribution<T> | undefined {
      return lookup(byPoint.get(k) ?? [], points.get(k)?.point.noun ?? k, ref) as Contribution<T> | undefined
    },
  })
}
