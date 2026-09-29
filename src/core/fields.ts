// Field validation and parsing. A field's definition is the only thing that
// decides what a valid value is; unknown fields are preserved and not checked.

import type { FieldDef, Item, Registry } from "./types.ts"

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/

/** Why `value` is not a valid value of `def`, or null when it is. */
export function fieldError(def: FieldDef, value: unknown): string | null {
  if (value === undefined || value === null) return null
  switch (def.kind) {
    case "string":
      return typeof value === "string" ? null : "is not a string"
    case "strings":
      return Array.isArray(value) && value.every((v) => typeof v === "string") ? null : "is not a list of strings"
    case "date":
      return typeof value === "string" && DATE.test(value) ? null : "is not a date (YYYY, YYYY-MM or YYYY-MM-DD)"
    case "boolean":
      return typeof value === "boolean" ? null : "is not true or false"
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "is not a number"
    case "enum": {
      const values = Object.keys(def.values ?? {})
      return typeof value === "string" && values.includes(value) ? null : `is not one of: ${values.join(", ")}`
    }
  }
}

/** Turn a command-line `field=value` into a stored value. Throws with the reason. */
export function parseFieldValue(def: FieldDef, raw: string): unknown {
  let value: unknown = raw
  if (def.kind === "strings") value = raw.split(",").map((s) => s.trim()).filter(Boolean)
  if (def.kind === "boolean") value = raw === "true" ? true : raw === "false" ? false : raw
  if (def.kind === "number") value = raw.trim() === "" ? raw : Number(raw)
  const error = fieldError(def, value)
  if (error) throw new Error(`${def.name}: "${raw}" ${error}`)
  return value
}

export const appliesTo = (def: FieldDef, type: string): boolean => !def.appliesTo || def.appliesTo.includes(type)

/** The fields that belong to an item's type. */
export function fieldsOf(registry: Registry, item: Item): FieldDef[] {
  return [...registry.fields.values()].filter((f) => appliesTo(f, item.type))
}

/** Rank of an enum value by declaration order; `fallback` when unset or unknown. */
export function enumRank(def: FieldDef | undefined, value: unknown, fallback: number): number {
  if (!def?.values || typeof value !== "string") return fallback
  const i = Object.keys(def.values).indexOf(value)
  return i === -1 ? fallback : i
}
