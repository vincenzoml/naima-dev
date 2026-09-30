// The data format, and moving data forward from one format to the next.
//
// `naima.json` carries `format`, an integer. A Naima reads exactly its own
// format: older data is migrated by `naima update`, newer data is refused.
// Migrations are forward only and deterministic — the same input gives
// byte-identical output — and idempotent, so a branch that merges a migrated
// trunk runs `naima update` again to finish the migration of its own new
// items. `check` fails on items still in a shape a migration replaced.
//
// Format 1 is the first format of the open specification (docs/format.md).
// Each migration adds one, so the format this Naima reads is 1 + the number
// of migrations it carries.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DATA_FILE } from "./layout.ts"
import { listDirs, META } from "./item.ts"
import { writeFileAtomic } from "./files.ts"
import { label } from "./lifecycle.ts"
import type { Check, Finding } from "./types.ts"

type Json = Record<string, unknown>

export interface Migration {
  /** The format it reads; it writes `from + 1`. */
  from: number
  says: string
  /** The new naima.json from the old one, without `format`. Pure. */
  config?(raw: Json): Json
  /** The new meta.json of one item from the old one. Pure. */
  item?(meta: Json): Json
  /** True when an item still has the shape this migration replaces: `check` reports it. */
  stale?(meta: Json): boolean
}

/** Every migration, in order. Empty while format 1 is the only format. */
export const MIGRATIONS: readonly Migration[] = []

/** The format this Naima reads and writes. */
export const FORMAT = 1 + MIGRATIONS.length

/** Whether `v` is a format number: an integer from 1. */
export const isFormat = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1

/** Why data of format `format` is not this Naima's to act on, or null when it is. Read after the file name. */
export function formatRefusal(format: unknown, reads = FORMAT): string | null {
  if (!isFormat(format)) return "has no format: it is not Naima data (docs/format.md)"
  if (format > reads) {
    return `is format ${format}, newer than the format ${reads} this Naima reads — it was written by a newer Naima: record that Naima's commit`
  }
  if (format < reads) return `is format ${format}, older than the format ${reads} this Naima reads — naima update migrates it`
  return null
}

const stringify = (value: unknown): string => JSON.stringify(value, null, 2) + "\n"

/** `format` first, then the keys as they were. */
const withFormat = (raw: Json, format: number): Json => {
  const { format: _old, ...rest } = raw
  return { format, ...rest }
}

/** Every item's meta.json under `data`, in a fixed order. */
function metaFiles(data: string): string[] {
  return listDirs(data).flatMap((dir) => listDirs(join(data, dir)).map((slug) => join(data, dir, slug, META))).filter((p) => existsSync(p))
}

/**
 * Migrate the data under `data` forward to the newest format `migrations`
 * reach. Returns the formats migrated from, in order; empty when the data is
 * already current. Throws, writing nothing, on data newer than that.
 */
export function migrate(data: string, migrations: readonly Migration[] = MIGRATIONS): number[] {
  migrations.forEach((m, i) => {
    if (m.from !== i + 1) throw new Error(`migration ${i + 1} reads format ${m.from}; migrations go 1, 2, 3… with no gap`)
  })
  const target = 1 + migrations.length
  const configPath = join(data, DATA_FILE)
  let config = JSON.parse(readFileSync(configPath, "utf8")) as Json
  const from = config["format"]
  const refusal = formatRefusal(from, target)
  if (!isFormat(from) || from > target) throw new Error(`${DATA_FILE} ${refusal}`)
  const steps = migrations.slice(from - 1)
  if (!steps.length) return []

  const items = metaFiles(data).map((path) => {
    const text = readFileSync(path, "utf8")
    return { path, text, meta: JSON.parse(text) as Json }
  })
  for (const step of steps) {
    if (step.config) config = step.config(config)
    if (step.item) { for (const i of items) i.meta = step.item(i.meta) }
  }
  // Read everything before writing anything: a migration that throws leaves the data as it was.
  for (const i of items) {
    const text = stringify(i.meta)
    if (text !== i.text) writeFileAtomic(i.path, text)
  }
  writeFileAtomic(configPath, stringify(withFormat(config, target)))
  return steps.map((s) => s.from)
}

/** The check that fails on items still in a shape one of `migrations` replaced: a tracker that mixes formats. */
export function formatCheck(migrations: readonly Migration[] = MIGRATIONS): Check {
  return {
    name: "one-format",
    says: "no item is still in a shape a format migration replaced: a tracker never mixes formats",
    run(ctx) {
      const out: Finding[] = []
      for (const m of migrations) {
        if (!m.stale) continue
        for (const item of ctx.repo.items) {
          if (m.stale(item.meta)) {
            out.push({ level: "problem", message: `${label(item)} is still in format ${m.from} (${m.says}) — naima update migrates it`, item })
          }
        }
      }
      return out
    },
  }
}
