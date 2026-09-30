// Reading the tracker: every registered type directory, every item in it.
// Nothing here writes, and nothing is cached across `reload()`.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { META, listDirs } from "./item.ts"
import type { Finding, Item, Link, Meta, Registry, Repo, ResolvedLink } from "./types.ts"

/** The well-formed links an item stores. Malformed ones are reported by `check`, never followed. */
export function storedLinks(meta: Meta): Link[] {
  if (!Array.isArray(meta.links)) return []
  return meta.links.filter((l): l is Link => !!l && typeof l.rel === "string" && typeof l.id === "string")
}

export function loadRepo(trackerRoot: string, registry: Registry): Repo {
  const items: Item[] = []
  const unreadable: Finding[] = []
  for (const type of registry.types.values()) {
    for (const slug of listDirs(join(trackerRoot, type.dir))) {
      const dir = join(trackerRoot, type.dir, slug)
      const where = `${type.dir}/${slug}`
      const path = join(dir, META)
      if (!existsSync(path)) {
        unreadable.push({ level: "problem", message: `${where}: no ${META}` })
        continue
      }
      try {
        const meta = JSON.parse(readFileSync(path, "utf8")) as unknown
        if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("not an object")
        items.push({ type: type.id, slug, dir, meta: meta as Meta })
      } catch (e) {
        unreadable.push({ level: "problem", message: `${where}: ${META} is not a JSON object (${(e as Error).message})` })
      }
    }
  }

  const byId = new Map<string, Item>()
  for (const item of items) if (typeof item.meta.id === "string" && !byId.has(item.meta.id)) byId.set(item.meta.id, item)

  // Only one direction of a link is stored; the inverse is computed here, so
  // the two halves can never disagree.
  const incoming = new Map<string, ResolvedLink[]>()
  for (const item of items) {
    for (const link of storedLinks(item.meta)) {
      if (!byId.has(link.id)) continue
      const inverse = registry.relations.get(link.rel)?.inverse ?? link.rel
      const list = incoming.get(link.id) ?? []
      list.push({ rel: inverse, id: item.meta.id, implied: true })
      incoming.set(link.id, list)
    }
  }

  const resolve = (ref: string): Item => {
    // An empty fragment is a fragment of every slug: it must never pick "the only item".
    if (!ref.trim()) throw new Error("no item named: an item reference cannot be empty")
    const exact =
      byId.get(ref) ??
      items.find((i) => `${i.type}/${i.slug}` === ref) ??
      items.find((i) => `${registry.types.get(i.type)?.dir}/${i.slug}` === ref)
    if (exact) return exact
    const bySlug = items.filter((i) => i.slug === ref)
    const candidates = bySlug.length ? bySlug : items.filter((i) => i.slug.includes(ref) || (typeof i.meta.id === "string" && i.meta.id.startsWith(ref)))
    if (candidates.length === 1 && candidates[0]) return candidates[0]
    if (candidates.length === 0) throw new Error(`no item matches "${ref}"`)
    throw new Error(`"${ref}" is ambiguous: ${candidates.map((i) => `${i.type}/${i.slug}`).join(", ")}`)
  }

  const linksOf = (item: Item): ResolvedLink[] => [
    ...storedLinks(item.meta).map((l) => ({ ...l, implied: false })),
    ...(incoming.get(item.meta.id) ?? []),
  ]

  return { items, unreadable, byId, resolve, linksOf }
}
