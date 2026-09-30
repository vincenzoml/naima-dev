// The project file, `naima/config.json`, and the plugins it adds.
//
// Automatic, not configured: every first-party plugin is always loaded, with
// defaults it infers from the repository. The file holds only what the tool
// cannot infer — the pin (`naima`, the Naima versions that may manage the
// project), the project's gates, and third-party plugins to add. Nothing in it
// switches anything on.

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { isRange, satisfies } from "./semver.ts"
import type { Config, Plugin, PluginEntry, PluginFactory, PluginOptions } from "./types.ts"

/** The one directory Naima owns in a host project. */
export const NAIMA_DIR = "naima"
/** The project file, relative to the project root. */
export const CONFIG_FILE = `${NAIMA_DIR}/config.json`

const KEYS = new Set(["naima", "gates", "plugins"])

/** Walk up from `start` to the first directory holding `naima/config.json`. */
export function findRoot(start: string): string | null {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

export function parseConfig(raw: unknown): Config {
  if (!isObject(raw)) throw new Error(`${CONFIG_FILE} must hold a JSON object`)
  for (const key of Object.keys(raw)) {
    if (!KEYS.has(key)) throw new Error(`${CONFIG_FILE}: unknown key "${key}" — it holds only naima (the pin), gates and plugins (third-party); everything else is inferred`)
  }
  const pin = raw.naima
  if (typeof pin !== "string" || !isRange(pin)) throw new Error(`${CONFIG_FILE}: naima must be the pin, a semver range such as "^0.2.0"`)
  const gates = raw.gates ?? {}
  if (!isObject(gates)) throw new Error(`${CONFIG_FILE}: gates must map a gate name to its definition`)
  const extras = raw.plugins ?? []
  if (!Array.isArray(extras)) throw new Error(`${CONFIG_FILE}: plugins must be a list of third-party plugins`)
  const plugins: PluginEntry[] = extras.map((p: unknown) => {
    if (typeof p === "string") return { name: p, options: {} }
    if (isObject(p) && typeof p.name === "string") {
      const options = p.options ?? {}
      if (!isObject(options)) throw new Error(`${CONFIG_FILE}: options of plugin "${p.name}" must be an object`)
      return { name: p.name, options: options as PluginOptions }
    }
    throw new Error(`${CONFIG_FILE}: a plugin entry is a path or package name, or { "name", "options" }`)
  })
  return { pin, gates, plugins }
}

export function readConfig(root: string): Config {
  const path = join(root, CONFIG_FILE)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, "utf8"))
  } catch (e) {
    throw new Error(`${CONFIG_FILE}: ${(e as Error).message}`)
  }
  return parseConfig(raw)
}

/** Null when `version` may manage the project, otherwise the one-line refusal. */
export function pinRefusal(version: string, pin: string): string | null {
  if (satisfies(version, pin)) return null
  return `naima ${version} does not manage this project: ${CONFIG_FILE} pins naima ${pin} — run npx naima@"${pin}"`
}

/**
 * The third-party plugins: a module (a path relative to the project root, or
 * a package name) whose default export is a plugin factory. The first-party
 * ones are not listed anywhere: the caller loads every one of them.
 */
export async function loadPlugins(root: string, config: Config, firstParty: string[]): Promise<Plugin[]> {
  const out: Plugin[] = []
  for (const entry of config.plugins) {
    if (firstParty.includes(entry.name)) throw new Error(`${CONFIG_FILE}: "${entry.name}" is first-party and always loaded — plugins lists only third-party ones`)
    const spec = entry.name.startsWith(".") || isAbsolute(entry.name) ? pathToFileURL(resolve(root, entry.name)).href : entry.name
    const mod = (await import(spec)) as { default?: unknown }
    if (typeof mod.default !== "function") throw new Error(`plugin "${entry.name}" has no default-exported factory`)
    out.push((mod.default as PluginFactory)(entry.options))
  }
  return out
}
