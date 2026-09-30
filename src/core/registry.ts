// Merging plugin manifests into one registry. A name claimed twice is an
// error at load time, never a silent override.

import type { Plugin, Registry } from "./types.ts"

function put<T>(map: Map<string, T>, key: string, value: T, what: string, owner: string, owners: Map<string, string>): void {
  const tag = `${what}:${key}`
  const previous = owners.get(tag)
  if (previous !== undefined) throw new Error(`${what} "${key}" is declared by both "${previous}" and "${owner}"`)
  owners.set(tag, owner)
  map.set(key, value)
}

export function buildRegistry(plugins: Plugin[]): Registry {
  const registry: Registry = {
    plugins,
    types: new Map(),
    fields: new Map(),
    relations: new Map(),
    dirs: new Set(),
    checks: [],
    commands: new Map(),
    views: new Map(),
    summary: [],
    rank: [],
    gates: new Map(),
    verifiers: new Map(),
  }
  const owners = new Map<string, string>()
  const names = new Set<string>()

  for (const p of plugins) {
    if (names.has(p.name)) throw new Error(`plugin "${p.name}" is loaded twice`)
    names.add(p.name)
    for (const t of p.types ?? []) {
      if (!Object.hasOwn(t.statuses, t.initialStatus)) throw new Error(`type "${t.id}": initial status "${t.initialStatus}" is not one of its statuses`)
      put(registry.types, t.id, t, "type", p.name, owners)
      if (registry.dirs.has(t.dir)) throw new Error(`directory "${t.dir}" is claimed twice`)
      registry.dirs.add(t.dir)
    }
    for (const d of p.dirs ?? []) {
      if (registry.dirs.has(d)) throw new Error(`directory "${d}" is claimed twice`)
      registry.dirs.add(d)
    }
    for (const f of p.fields ?? []) put(registry.fields, f.name, f, "field", p.name, owners)
    for (const r of p.relations ?? []) put(registry.relations, r.name, r, "relation", p.name, owners)
    for (const c of p.commands ?? []) put(registry.commands, c.name, c, "command", p.name, owners)
    for (const v of p.views ?? []) put(registry.views, v.name, v, "view", p.name, owners)
    for (const g of p.gates ?? []) put(registry.gates, g.name, g, "gate", p.name, owners)
    for (const v of p.verifiers ?? []) put(registry.verifiers, v.id, v, "verifier", p.name, owners)
    registry.checks.push(...(p.checks ?? []))
    registry.summary.push(...(p.summary ?? []))
    registry.rank.push(...(p.rank ?? []))
  }

  for (const r of registry.relations.values()) {
    if (!registry.relations.has(r.inverse)) throw new Error(`relation "${r.name}" names inverse "${r.inverse}", which is not declared`)
  }
  for (const f of registry.fields.values()) {
    for (const t of f.appliesTo ?? []) {
      if (!registry.types.has(t)) throw new Error(`field "${f.name}" applies to type "${t}", which no plugin declares`)
    }
  }
  return registry
}
