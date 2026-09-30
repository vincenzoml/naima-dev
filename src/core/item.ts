// Items on disk: one directory each, `meta.json` for fields, `README.md` for prose.

import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Context, Item, Meta, TypeDef } from "./types.ts"

export const META = "meta.json"
export const README = "README.md"
export const ATTACHMENTS = "attachments"

const STOP_WORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "and", "or", "is", "are", "be", "for", "with", "it", "its"])

/** A readable directory name. Slugs may change; ids may not. */
export function slugify(text: string, maxWords = 7): string {
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !STOP_WORDS.has(w))
  return words.slice(0, maxWords).join("-").slice(0, 60).replace(/-+$/, "") || "item"
}

export function uniqueSlug(slug: string, taken: Set<string>): string {
  if (!taken.has(slug)) return slug
  for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`
}

export const isUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)

export const today = (ctx: Context): string => ctx.now().toISOString().slice(0, 10)

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n")
}

export function readReadme(item: Item): string {
  const path = join(item.dir, README)
  return existsSync(path) ? readFileSync(path, "utf8") : ""
}

export function saveMeta(item: Item): void {
  writeJson(join(item.dir, META), item.meta)
}

export function listDirs(path: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort()
}

const defaultTemplate = (title: string): string =>
  `# ${title}\n\nDescribe it here.\n`

/** Open a new item. Writes only inside its own new directory. */
export function createItem(ctx: Context, type: TypeDef, title: string, fields: Record<string, unknown> = {}): Item {
  const base = join(ctx.trackerRoot, type.dir)
  const slug = uniqueSlug(slugify(title), new Set(listDirs(base)))
  const dir = join(base, slug)
  mkdirSync(join(dir, ATTACHMENTS), { recursive: true })
  writeFileSync(join(dir, ATTACHMENTS, ".gitkeep"), "")
  writeFileSync(join(dir, README), (type.template ?? defaultTemplate)(title))
  const meta: Meta = { id: randomUUID(), title, status: type.initialStatus, created: today(ctx), ...fields }
  const item: Item = { type: type.id, slug, dir, meta }
  saveMeta(item)
  ctx.reload()
  return item
}

/** Move an item to another type's directory, keeping its id and slug. */
export function moveItem(ctx: Context, item: Item, to: TypeDef): Item {
  const base = join(ctx.trackerRoot, to.dir)
  mkdirSync(base, { recursive: true })
  const slug = uniqueSlug(item.slug, new Set(listDirs(base)))
  const dir = join(base, slug)
  renameSync(item.dir, dir)
  const moved: Item = { type: to.id, slug, dir, meta: item.meta }
  ctx.reload()
  return moved
}
