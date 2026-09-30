// Merging plugin manifests into one registry. A name claimed twice is an
// error at load time, never a silent override.

import { FrozenMap, FrozenSet } from "./collections.ts"
import type { Check, Command, FieldDef, GateDef, Plugin, RankTerm, Registry, RelationDef, SummarySection, TypeDef, Verifier, View, WriteHook } from "./types.ts"

export interface RegistryOptions {
  /** Command names the entry point answers before any plugin is loaded: a plugin command by one of them could never run. */
  reserved?: string[]
}

export function buildRegistry(plugins: Plugin[], opts: RegistryOptions = {}): Registry {
  // Built mutable here, then handed out frozen: no plugin can change another's contributions at run time.
  const registry = {
    types: new Map<string, TypeDef>(),
    fields: new Map<string, FieldDef>(),
    relations: new Map<string, RelationDef>(),
    dirs: new Set<string>(),
    checks: [] as Check[],
    commands: new Map<string, Command>(),
    views: new Map<string, View>(),
    summary: [] as SummarySection[],
    rank: [] as RankTerm[],
    gates: new Map<string, GateDef>(),
    verifiers: new Map<string, Verifier>(),
    hooks: [] as WriteHook[],
  }
  const owners = new Map<string, string>()
  const names = new Set<string>()
  const reserved = new Set(opts.reserved ?? [])
  /** Record that `owner` declares `what` named `key`; a second declaration is an error naming both. */
  const own = (what: string, key: string, owner: string): void => {
    const tag = `${what}:${key}`
    const previous = owners.get(tag)
    if (previous !== undefined) throw new Error(`${what} "${key}" is declared by both "${previous}" and "${owner}"`)
    owners.set(tag, owner)
  }
  const put = <T>(map: Map<string, T>, key: string, value: T, what: string, owner: string): void => {
    own(what, key, owner)
    map.set(key, value)
  }

  for (const p of plugins) {
    if (names.has(p.name)) throw new Error(`plugin "${p.name}" is loaded twice`)
    names.add(p.name)
    for (const t of p.types ?? []) {
      if (!Object.hasOwn(t.statuses, t.initialStatus)) throw new Error(`type "${t.id}": initial status "${t.initialStatus}" is not one of its statuses`)
      put(registry.types, t.id, t, "type", p.name)
      if (registry.dirs.has(t.dir)) throw new Error(`directory "${t.dir}" is claimed twice`)
      registry.dirs.add(t.dir)
    }
    for (const d of p.dirs ?? []) {
      if (registry.dirs.has(d)) throw new Error(`directory "${d}" is claimed twice`)
      registry.dirs.add(d)
    }
    for (const f of p.fields ?? []) put(registry.fields, f.name, f, "field", p.name)
    for (const r of p.relations ?? []) put(registry.relations, r.name, r, "relation", p.name)
    for (const c of p.commands ?? []) {
      if (reserved.has(c.name)) {
        throw new Error(`command "${c.name}" is answered by the entry point before any plugin loads, so "${p.name}" can never run it — rename it`)
      }
      put(registry.commands, c.name, c, "command", p.name)
    }
    for (const v of p.views ?? []) put(registry.views, v.name, v, "view", p.name)
    for (const g of p.gates ?? []) put(registry.gates, g.name, g, "gate", p.name)
    for (const v of p.verifiers ?? []) put(registry.verifiers, v.id, v, "verifier", p.name)
    // Kept in load order, and named once each, so a finding or a line can be traced to its declaration.
    for (const c of p.checks ?? []) own("check", c.name, p.name)
    for (const s of p.summary ?? []) own("summary section", s.name, p.name)
    for (const t of p.rank ?? []) own("rank term", t.name, p.name)
    for (const h of p.hooks ?? []) own("write hook", h.name, p.name)
    registry.checks.push(...(p.checks ?? []))
    registry.summary.push(...(p.summary ?? []))
    registry.rank.push(...(p.rank ?? []))
    registry.hooks.push(...(p.hooks ?? []))
  }

  for (const r of registry.relations.values()) {
    if (!registry.relations.has(r.inverse)) throw new Error(`relation "${r.name}" names inverse "${r.inverse}", which is not declared`)
  }
  for (const f of registry.fields.values()) {
    for (const t of f.appliesTo ?? []) {
      if (!registry.types.has(t)) throw new Error(`field "${f.name}" applies to type "${t}", which no plugin declares`)
    }
  }
  return Object.freeze({
    plugins: Object.freeze([...plugins]),
    types: new FrozenMap(registry.types),
    fields: new FrozenMap(registry.fields),
    relations: new FrozenMap(registry.relations),
    dirs: new FrozenSet(registry.dirs),
    checks: Object.freeze(registry.checks),
    commands: new FrozenMap(registry.commands),
    views: new FrozenMap(registry.views),
    summary: Object.freeze(registry.summary),
    rank: Object.freeze(registry.rank),
    gates: new FrozenMap(registry.gates),
    verifiers: new FrozenMap(registry.verifiers),
    hooks: Object.freeze(registry.hooks),
  })
}
