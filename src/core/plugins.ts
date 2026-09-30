// Which plugins a project loads, and from where: every first-party plugin
// unless the project switches it off or replaces it, then every third-party
// plugin its `plugins` table adds. Code runs only from the program — never
// from the data, never from a package — so a project that wants a plugin of
// its own carries it in its fork of Naima.

import { isAbsolute, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { DATA_FILE } from "./layout.ts"
import type { Config, FirstParty, Plugin, PluginConfig, PluginFactory, Severity } from "./types.ts"

/** The core's own entry in the table: it cannot be switched off or replaced, only its checks weighed. */
export const CORE = "core"

/** A module's default-exported factory, from a path inside the program. */
async function factoryAt(program: string, source: string, name: string): Promise<PluginFactory> {
  const path = resolve(program, source)
  const inside = relative(program, path)
  if (isAbsolute(source) || !inside || inside.startsWith("..") || isAbsolute(inside)) {
    throw new Error(
      `${DATA_FILE}: plugins.${name}: ${source} is not a path inside the program — code runs only from the program; carry the plugin in a fork of Naima`,
    )
  }
  const mod = (await import(pathToFileURL(path).href)) as { default?: unknown }
  if (typeof mod.default !== "function") throw new Error(`${DATA_FILE}: plugins.${name}: ${source} has no default-exported factory`)
  return mod.default as PluginFactory
}

/** The plugin a factory makes for `entry`, under the name the project gives it: its contributions are that name's. */
function make(name: string, factory: PluginFactory, entry: PluginConfig | undefined): Plugin {
  const manifest = factory(entry?.options ?? {})
  return manifest.name === name ? manifest : { ...manifest, name }
}

/**
 * Every plugin `config` loads, in load order: the first-party ones in their
 * order — each as it is, switched off, or replaced by the module its
 * `replacedBy` names — then the third-party ones in the table's order.
 */
export async function composePlugins(program: string, config: Pick<Config, "plugins">, firstParty: readonly FirstParty[]): Promise<Plugin[]> {
  const out: Plugin[] = []
  const known = new Set(firstParty.map((p) => p.name))
  for (const { name, factory } of firstParty) {
    const entry = config.plugins[name]
    if (entry?.source !== undefined) {
      throw new Error(
        `${DATA_FILE}: plugins.${name} is first-party and already loaded — replacedBy runs other code under its name; source is for a third-party plugin`,
      )
    }
    if (entry?.enabled === false) continue
    out.push(make(name, entry?.replacedBy ? await factoryAt(program, entry.replacedBy, name) : factory, entry))
  }
  for (const [name, entry] of Object.entries(config.plugins)) {
    if (known.has(name)) continue
    if (name === CORE) {
      if (!entry.enabled || entry.source || entry.replacedBy || Object.keys(entry.options).length) {
        throw new Error(`${DATA_FILE}: plugins.${CORE} is the core: it is always loaded as it is, and only its checks can be weighed`)
      }
      continue
    }
    if (entry.replacedBy !== undefined) {
      throw new Error(`${DATA_FILE}: plugins.${name}: replacedBy replaces a first-party plugin, and ${name} is none — name its code in source`)
    }
    if (entry.source === undefined) {
      throw new Error(`${DATA_FILE}: plugins.${name} is no first-party plugin and names no source — first-party: ${[...known].join(", ")}`)
    }
    if (!entry.enabled) continue
    out.push(make(name, await factoryAt(program, entry.source, name), entry))
  }
  return out
}

/** The severity the project gives each plugin's checks: plugin name → check name → severity. */
export const severitiesOf = (config: Pick<Config, "plugins">): Record<string, Record<string, Severity>> =>
  Object.fromEntries(Object.entries(config.plugins).map(([name, e]) => [name, e.checks]))
