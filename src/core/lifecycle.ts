// Questions about an item that depend only on what its type declares.

import type { Context, Item } from "./types.ts"

export function statusDef(ctx: Context, item: Item) {
  return ctx.registry.types.get(item.type)?.statuses[item.meta.status]
}

export const isOpen = (ctx: Context, item: Item): boolean => statusDef(ctx, item)?.category !== "done"

/** Does this item's status count as evidence for what it verifies? */
export const proves = (ctx: Context, item: Item): boolean => statusDef(ctx, item)?.proves === true

/** Can items of this type ever count as evidence? */
export const isEvidenceType = (ctx: Context, type: string): boolean =>
  Object.values(ctx.registry.types.get(type)?.statuses ?? {}).some((s) => s.proves === true)

/** Items linked to `item` by `rel`, in either stored direction. */
export function linked(ctx: Context, item: Item, rel: string): Item[] {
  const out: Item[] = []
  for (const l of ctx.repo.linksOf(item)) {
    if (l.rel !== rel) continue
    const other = ctx.repo.byId.get(l.id)
    if (other && !out.includes(other)) out.push(other)
  }
  return out
}

/** Sum of every plugin's rank terms. Lower is more urgent; done items sink. */
export function urgency(ctx: Context, item: Item): number {
  const base = isOpen(ctx, item) ? 0 : 100
  return ctx.registry.rank.reduce((sum, term) => sum + term.score(item, ctx), base)
}

export function byUrgency(ctx: Context, items: Item[]): Item[] {
  const score = new Map(items.map((i) => [i, urgency(ctx, i)]))
  return [...items].sort((a, b) => (score.get(a) ?? 0) - (score.get(b) ?? 0) || a.slug.localeCompare(b.slug))
}

export const label = (item: Item): string => `${item.type}/${item.slug}`
