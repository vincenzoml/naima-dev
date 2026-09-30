// Items on disk: one directory each, `meta.json` for fields, `README.md` for prose.

import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { writeFileAtomic } from "./files.ts"
import type { Context, Item, Meta, TypeDef } from "./types.ts"

export const META = "meta.json"
export const README = "README.md"
export const ATTACHMENTS = "attachments"

const STOP_WORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "and", "or", "is", "are", "be", "for", "with", "it", "its"])

/**
 * The words of a title, in any script: lowercased, compatibility-normalised,
 * with the accents of Latin letters dropped (so "Café" is "cafe") and every
 * other letter and digit kept. What slugs and the duplicate check compare.
 */
export function titleWords(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** A readable directory name. Slugs may change; ids may not. */
export function slugify(text: string, maxWords = 7): string {
  const words = titleWords(text).filter((w) => !STOP_WORDS.has(w))
  return [...words.slice(0, maxWords).join("-")].slice(0, 60).join("").replace(/-+$/, "") || "item"
}

/** `slug`, or the first `slug-<n>` free in `taken`. Compared without case: a case-insensitive file system holds one of `a` and `A`. */
export function uniqueSlug(slug: string, taken: Set<string>): string {
  const lower = new Set([...taken].map((s) => s.toLowerCase()))
  const free = (s: string): boolean => !lower.has(s.toLowerCase())
  if (free(slug)) return slug
  for (let n = 2;; n++) if (free(`${slug}-${n}`)) return `${slug}-${n}`
}

/**
 * Make a new, empty directory under `base` named `slug` or the first free
 * suffix of it, and return the name used. The directory is created without
 * `recursive`, so it fails on one that exists — made in another case, or by a
 * concurrent run between the listing and the write — and the next suffix is
 * tried instead of writing into someone else's item.
 */
function claimDir(base: string, slug: string): string {
  mkdirSync(base, { recursive: true })
  const taken = new Set(listDirs(base))
  for (;;) {
    const name = uniqueSlug(slug, taken)
    try {
      mkdirSync(join(base, name))
      return name
    } catch (e) {
      if ((e as { code?: unknown }).code !== "EEXIST") throw e
      taken.add(name)
    }
  }
}

export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)

export const today = (ctx: Context): string => ctx.now().toISOString().slice(0, 10)

let generation = 0

/**
 * How many writes the helpers of this module have made in this process. A
 * context's repo is re-read when it moves, so a write is seen by the next read
 * without anyone having to remember to reload.
 */
export const writes = (): number => generation

/** Write a value as JSON, atomically (writeFileAtomic). */
export function writeJson(path: string, value: unknown): void {
  writeFileAtomic(path, JSON.stringify(value, null, 2) + "\n")
  generation++
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

const defaultTemplate = (title: string): string => `# ${title}\n\nDescribe it here.\n`

/** Open a new item. Writes only inside its own new directory. */
export function createItem(ctx: Context, type: TypeDef, title: string, fields: Record<string, unknown> = {}): Item {
  const base = join(ctx.trackerRoot, type.dir)
  const slug = claimDir(base, slugify(title))
  const dir = join(base, slug)
  mkdirSync(join(dir, ATTACHMENTS))
  writeFileSync(join(dir, ATTACHMENTS, ".gitkeep"), "")
  writeFileSync(join(dir, README), (type.template ?? defaultTemplate)(title))
  const meta: Meta = { id: randomUUID(), title, status: type.initialStatus, created: today(ctx), ...fields }
  const item: Item = { type: type.id, slug, dir, meta }
  saveMeta(item)
  return item
}

/** Move an item to another type's directory, keeping its id and slug. */
export function moveItem(ctx: Context, item: Item, to: TypeDef): Item {
  const base = join(ctx.trackerRoot, to.dir)
  mkdirSync(base, { recursive: true })
  const slug = uniqueSlug(item.slug, new Set(listDirs(base)))
  const dir = join(base, slug)
  renameSync(item.dir, dir)
  generation++
  return { type: to.id, slug, dir, meta: item.meta }
}
