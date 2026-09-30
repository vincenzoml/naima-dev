// Opening a project: its naima.json, every plugin it loads, their formats,
// the registry, the context. What `naima update` migrates is decided here
// too, because a plugin's migrations are known only once it is loaded.

import { corePlugin } from "./base.ts"
import { parseConfig, readRaw } from "./config.ts"
import { composePlugins, severitiesOf } from "./plugins.ts"
import { consoleIO, createContext, type IO, type Place } from "./context.ts"
import { RESERVED } from "./entry.ts"
import { FORMAT, formatOf, formatRefusal, formatsOf, migrateConfig, MIGRATIONS, type Migrations, type Pending, pending, stepsSaid } from "./format.ts"
import { DATA_FILE } from "./layout.ts"
import { buildRegistry } from "./registry.ts"
import type { Config, Context, FirstParty, Plugin } from "./types.ts"

type Json = Record<string, unknown>

export interface OpenOptions {
  /** The Naima that is running: the directory holding its naima.ts and src/. */
  programRoot: string
  /** Every first-party plugin, in load order. */
  firstParty: readonly FirstParty[]
  /**
   * Run by the launcher, as the project's authority. Data that still owes a
   * migration is then refused until `naima update` runs it; the development
   * build reads it as migrated, in memory, when only naima.json would change.
   */
  launched?: boolean
}

const CORE: Migrations = { plugin: null, migrations: MIGRATIONS }

/** Every plugin `config` loads, first-party then third-party, in load order. */
export const pluginsOf = (config: Config, opts: OpenOptions): Promise<Plugin[]> => composePlugins(opts.programRoot, config, opts.firstParty)

/** The migrations of the core and of every plugin `plugins` holds, in the order they run. */
export const migrationsOf = (plugins: readonly Plugin[]): Migrations[] => [CORE, ...plugins.map((p) => ({ plugin: p.name, migrations: p.migrations ?? [] }))]

/**
 * The plugins a raw naima.json loads as it stands, and every migration it
 * owes. Its core shape is brought current in memory first, so the plugins can
 * be read from it; their own migrations may still be owed.
 */
export async function owed(raw: Json, opts: OpenOptions): Promise<{ plugins: Plugin[]; all: Migrations[]; steps: Pending[] }> {
  const core = migrateConfig(raw, pending(raw, [CORE]), [CORE])
  const plugins = await pluginsOf(parseConfig({ ...core, format: FORMAT }, { lenient: true }), opts)
  const all = migrationsOf(plugins)
  return { plugins, all, steps: pending(raw, all) }
}

/** Why data that owes `steps` is not read: what `naima update` would run. */
function refusal(raw: Json, steps: readonly Pending[], all: readonly Migrations[]): string {
  const first = steps[0] as Pending
  const target = formatOf(all.find((m) => m.plugin === first.plugin)?.migrations)
  const at = first.plugin === null ? raw["format"] : formatsOf(raw)[first.plugin] ?? 1
  return `${DATA_FILE} ${formatRefusal(at, target, first.plugin)}`
}

/** The config this Naima reads from `raw` and the plugins it loads, migrations owed or refused as `opts` says. */
async function load(raw: Json, opts: OpenOptions, io: IO): Promise<{ config: Config; plugins: Plugin[] }> {
  const { plugins, all, steps } = await owed(raw, opts)
  if (!steps.length) return { config: parseConfig(raw), plugins }
  if (opts.launched) throw new Error(refusal(raw, steps, all))
  if (steps.some((s) => s.migration.item)) {
    throw new Error(`${refusal(raw, steps, all)} — the development build reads older data only when its migrations change naima.json alone`)
  }
  const config = parseConfig(migrateConfig(raw, steps, all))
  io.err(`naima: the data owes ${stepsSaid(steps)} — read as migrated, in memory; naima update migrates it`)
  return { config, plugins: await pluginsOf(config, opts) }
}

/** Load a project into a context: its config in this Naima's formats, every plugin, the registry. */
export async function openProject(place: Place, opts: OpenOptions, io: IO = consoleIO): Promise<Context> {
  const { config, plugins } = await load(readRaw(place.data), opts, io)
  return createContext(place, config, buildRegistry([corePlugin, ...plugins], { reserved: [...RESERVED], severities: severitiesOf(config) }), io)
}

/** The formats a new project starts at: every plugin's own that has moved past format 1. */
export function formatsFor(plugins: readonly Plugin[]): Record<string, number> {
  return Object.fromEntries(plugins.filter((p) => formatOf(p.migrations) > 1).map((p) => [p.name, formatOf(p.migrations)]))
}
