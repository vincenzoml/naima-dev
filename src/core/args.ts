// Command-line arguments, on top of node:util's parser.

import { parseArgs } from "node:util"

export type Flags = Record<string, { type: "string" | "boolean"; multiple?: boolean; short?: string }>

export interface Parsed {
  positionals: string[]
  values: Record<string, string | boolean | (string | boolean)[] | undefined>
}

export function parse(args: string[], flags: Flags = {}): Parsed {
  const { positionals, values } = parseArgs({ args, options: flags, allowPositionals: true, strict: true })
  return { positionals, values }
}

export const str = (p: Parsed, name: string): string | undefined => {
  const v = p.values[name]
  return typeof v === "string" ? v : undefined
}

export const strs = (p: Parsed, name: string): string[] => {
  const v = p.values[name]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : []
}

export const bool = (p: Parsed, name: string): boolean => p.values[name] === true

/** Split `field=value` pairs. */
export function pairs(list: string[]): [string, string][] {
  return list.map((pair) => {
    const at = pair.indexOf("=")
    if (at < 1) throw new Error(`"${pair}" is not field=value`)
    return [pair.slice(0, at), pair.slice(at + 1)]
  })
}
