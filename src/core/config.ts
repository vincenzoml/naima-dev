// The project file, `naima-data/naima.json`, and the plugins it adds.
//
// Automatic, not configured: every first-party plugin is always loaded, with
// defaults it infers from the repository. The file holds only what the tool
// cannot infer — the data format, the lock (which Naima runs: its source,
// commit and how it is carried), where the program is when it has moved, the
// project's gates, and third-party plugins to add. Nothing in it switches
// anything on. The format is specified in docs/format.md.

import { readFileSync } from "node:fs"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { message } from "./errors.ts"
import { writeFileAtomic } from "./files.ts"
import { DATA_FILE, DEFAULT_PROGRAM } from "./layout.ts"
import { FORMAT, formatRefusal } from "./format.ts"
import type { Carry, Config, Plugin, PluginEntry, PluginFactory, PluginOptions } from "./types.ts"

export const CARRY_MODES: readonly Carry[] = ["clone", "vendored", "submodule"]

const KEYS = new Set(["format", "source", "commit", "carry", "program", "gates", "plugins"])
const COMMIT = /^[0-9a-f]{40}$/

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

export type Lock = Pick<Config, "source" | "commit" | "carry" | "program">

/** A source on this disk rather than behind a URL. */
export const isLocalSource = (source: string): boolean => source.startsWith("file:") || !/^([a-z][a-z0-9+.-]*:\/\/|[^/\\\s]+@[^:/\\\s]+:)/i.test(source)

/**
 * Why `source` cannot be a lock's source, or null. It is handed to git as an
 * argument, so it never starts with "-" (git would read it as an option); a
 * path on this disk is absolute, or it would resolve against whatever
 * directory git happens to run in.
 */
export function sourceRefusal(source: string): string | null {
  if (source.startsWith("-")) return "must not start with \"-\": git would read it as an option"
  if (isLocalSource(source) && !source.startsWith("file:") && !isAbsolute(source)) return "a path on this disk must be absolute: a relative one resolves against wherever git runs"
  return null
}

/**
 * The lock: which Naima runs the project, and where it is. The same keys in
 * every format, so that a Naima can be aligned, and can update, whatever the
 * format of the data it is about to read.
 */
export function parseLock(raw: Record<string, unknown>): Lock {
  const { source, commit } = raw
  if (typeof source !== "string" || !source.trim()) throw new Error(`${DATA_FILE}: source must be the git URL (or absolute path) of the Naima this project runs`)
  const refusal = sourceRefusal(source)
  if (refusal) throw new Error(`${DATA_FILE}: source ${refusal}`)
  if (typeof commit !== "string" || !COMMIT.test(commit)) throw new Error(`${DATA_FILE}: commit must be the full hash of the Naima commit this project runs`)
  const carry = raw["carry"] ?? "clone"
  if (!CARRY_MODES.includes(carry as Carry)) throw new Error(`${DATA_FILE}: carry must be one of: ${CARRY_MODES.join(", ")}`)
  const program = raw["program"] ?? DEFAULT_PROGRAM
  if (typeof program !== "string" || !program.trim()) throw new Error(`${DATA_FILE}: program must be a path, relative to the data directory`)
  return { source, commit, carry: carry as Carry, program }
}

/** The contents of a naima.json in the format this Naima reads. Throws with the reason when it is not one. */
export function parseConfig(raw: unknown): Config {
  if (!isObject(raw)) throw new Error(`${DATA_FILE} must hold a JSON object`)
  const refusal = formatRefusal(raw["format"])
  if (refusal) throw new Error(`${DATA_FILE} ${refusal}`)
  for (const key of Object.keys(raw)) {
    if (!KEYS.has(key)) throw new Error(`${DATA_FILE}: unknown key "${key}" — it holds only ${[...KEYS].join(", ")}; everything else is inferred`)
  }
  const lock = parseLock(raw)
  const gates = raw["gates"] ?? {}
  if (!isObject(gates)) throw new Error(`${DATA_FILE}: gates must map a gate name to its definition`)
  const extras = raw["plugins"] ?? []
  if (!Array.isArray(extras)) throw new Error(`${DATA_FILE}: plugins must be a list of third-party plugins`)
  const plugins: PluginEntry[] = extras.map((p: unknown) => {
    if (typeof p === "string") return { name: p, options: {} }
    if (isObject(p) && typeof p["name"] === "string") {
      const options = p["options"] ?? {}
      if (!isObject(options)) throw new Error(`${DATA_FILE}: options of plugin "${p["name"]}" must be an object`)
      return { name: p["name"], options: options as PluginOptions }
    }
    throw new Error(`${DATA_FILE}: a plugin entry is a path inside the program, or { "name", "options" }`)
  })
  return { format: FORMAT, ...lock, gates, plugins }
}

/** The raw JSON of `<data>/naima.json`. */
export function readRaw(data: string): Record<string, unknown> {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(join(data, DATA_FILE), "utf8"))
  } catch (e) {
    throw new Error(`${DATA_FILE}: ${message(e)}`)
  }
  if (!isObject(raw)) throw new Error(`${DATA_FILE} must hold a JSON object`)
  return raw
}

export const readConfig = (data: string): Config => parseConfig(readRaw(data))

/** Write `<data>/naima.json`, keys in the order given. */
export function writeRaw(data: string, raw: Record<string, unknown>): void {
  writeFileAtomic(join(data, DATA_FILE), JSON.stringify(raw, null, 2) + "\n")
}

/**
 * The program directory `<data>/naima.json` names, or the default one when the
 * file cannot be read — the program then reports what is wrong with it. For
 * the launcher, which must know where the program is before anything runs.
 */
export function programOf(data: string): string {
  try {
    const raw = readRaw(data)
    return resolve(data, typeof raw["program"] === "string" ? raw["program"] : DEFAULT_PROGRAM)
  } catch {
    return resolve(data, DEFAULT_PROGRAM)
  }
}

/** The absolute program directory of a project whose data is `data`. */
export const programDir = (data: string, config: Pick<Config, "program">): string => resolve(data, config.program)

/**
 * The third-party plugins: a module whose default export is a plugin factory,
 * named by its path inside the program. Code runs only from the program —
 * never from the data, never from a package — so a project that wants a
 * plugin carries it in its fork of Naima. The first-party ones are not listed
 * anywhere: the caller loads every one of them.
 */
export async function loadPlugins(program: string, config: Config, firstParty: string[]): Promise<Plugin[]> {
  const out: Plugin[] = []
  for (const entry of config.plugins) {
    if (firstParty.includes(entry.name)) throw new Error(`${DATA_FILE}: "${entry.name}" is first-party and always loaded — plugins lists only third-party ones`)
    const path = resolve(program, entry.name)
    const inside = relative(program, path)
    if (isAbsolute(entry.name) || !inside || inside.startsWith("..") || isAbsolute(inside)) {
      throw new Error(`${DATA_FILE}: plugin "${entry.name}" is not a path inside the program — code runs only from the program; carry the plugin in a fork of Naima`)
    }
    const mod = (await import(pathToFileURL(path).href)) as { default?: unknown }
    if (typeof mod.default !== "function") throw new Error(`plugin "${entry.name}" has no default-exported factory`)
    out.push((mod.default as PluginFactory)(entry.options))
  }
  return out
}

/** A path from `from` to `to`, with forward slashes: for messages, and for git. */
export const posixRelative = (from: string, to: string): string => relative(from, to).split(sep).join("/")
