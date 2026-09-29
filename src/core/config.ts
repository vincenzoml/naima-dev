// The project file, `naima.config.json`, and turning its plugin list into plugins.

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { Config, Plugin, PluginEntry, PluginFactory, PluginOptions } from "./types.ts"

export const CONFIG_FILE = "naima.config.json"

/** Walk up from `start` to the nearest directory holding a config file. */
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
  const trackerDir = raw.trackerDir ?? "tracker"
  if (typeof trackerDir !== "string" || !trackerDir || isAbsolute(trackerDir)) throw new Error(`${CONFIG_FILE}: trackerDir must be a relative path`)
  if (!Array.isArray(raw.plugins)) throw new Error(`${CONFIG_FILE}: plugins must be a list`)
  const plugins: PluginEntry[] = raw.plugins.map((p: unknown) => {
    if (typeof p === "string") return { name: p, options: {} }
    if (isObject(p) && typeof p.name === "string") {
      const options = p.options ?? {}
      if (!isObject(options)) throw new Error(`${CONFIG_FILE}: options of plugin "${p.name}" must be an object`)
      return { name: p.name, options: options as PluginOptions }
    }
    throw new Error(`${CONFIG_FILE}: a plugin entry is a name or { "name", "options" }`)
  })
  return { trackerDir, plugins }
}

export function readConfig(root: string): Config {
  return parseConfig(JSON.parse(readFileSync(join(root, CONFIG_FILE), "utf8")))
}

/**
 * Resolve every entry to a plugin: a built-in by name, otherwise a module
 * (a path relative to the project root, or a package name) whose default
 * export is a plugin factory. The core ships no built-ins of its own; the
 * caller passes them in.
 */
export async function loadPlugins(root: string, config: Config, builtins: Record<string, PluginFactory>): Promise<Plugin[]> {
  const out: Plugin[] = []
  for (const entry of config.plugins) {
    let factory = builtins[entry.name]
    if (!factory) {
      const spec = entry.name.startsWith(".") || isAbsolute(entry.name) ? pathToFileURL(resolve(root, entry.name)).href : entry.name
      const mod = (await import(spec)) as { default?: unknown }
      if (typeof mod.default !== "function") throw new Error(`plugin "${entry.name}" has no default-exported factory`)
      factory = mod.default as PluginFactory
    }
    out.push(factory(entry.options))
  }
  return out
}
