// The one entry point: find the project, check its pin, load every plugin, dispatch.

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { corePlugin } from "./base.ts"
import { CONFIG_FILE, NAIMA_DIR, findRoot, loadPlugins, pinRefusal, readConfig } from "./config.ts"
import { type IO, consoleIO, createContext } from "./context.ts"
import { writeJson } from "./item.ts"
import { parseVersion } from "./semver.ts"
import { buildRegistry } from "./registry.ts"
import type { Command, Config, Context, Plugin } from "./types.ts"

export interface CliOptions {
  cwd: string
  /** This Naima's version, checked against the project's pin. */
  version: string
  /** Every first-party plugin, built from the config. All of them are always loaded. */
  firstParty: (config: Config) => Plugin[]
  io?: IO
}

/** Load a project into a context: config, pin, plugins, registry. */
export async function openProject(root: string, opts: Pick<CliOptions, "version" | "firstParty">, io: IO = consoleIO): Promise<Context> {
  const config = readConfig(root)
  const refusal = pinRefusal(opts.version, config.pin)
  if (refusal) throw new Error(refusal)
  const firstParty = opts.firstParty(config)
  const extra = await loadPlugins(root, config, firstParty.map((p) => p.name))
  return createContext(root, config, buildRegistry([corePlugin, ...firstParty, ...extra]), io)
}

/** The two commands the entry point answers itself, before any plugin is loaded. Documented like any other. */
export const cliCommands: Omit<Command, "run">[] = [
  {
    name: "init",
    says: `make this git repository a Naima project: create ${CONFIG_FILE}, pinned to this Naima; nothing outside ${NAIMA_DIR}/ is touched`,
    usage: "init",
    examples: ["init"],
  },
  {
    name: "help",
    says: "list every command the loaded plugins provide, with its usage",
    usage: "help",
    examples: ["help"],
  },
]

/** The pin `init` writes: this version's caret range. */
export function pinFor(version: string): string {
  const v = parseVersion(version)
  if (!v) throw new Error(`"${version}" is not a version`)
  return `^${v[0]}.${v[1]}.${v[2]}`
}

function init(opts: CliOptions, io: IO): number {
  let root: string
  try {
    root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: resolve(opts.cwd), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    throw new Error("not a git repository — naima init makes a git repository a Naima project")
  }
  if (existsSync(join(root, CONFIG_FILE))) io.out(`${CONFIG_FILE} already exists — left as it is`)
  else {
    writeJson(join(root, CONFIG_FILE), { naima: pinFor(opts.version) })
    io.out(`wrote ${relative(resolve(opts.cwd), join(root, CONFIG_FILE)) || CONFIG_FILE}`)
  }
  io.out(`next: naima new todos "<the first thing to do>"`)
  return 0
}

function help(ctx: Context | null, io: IO): number {
  io.out("usage: naima <command> [args]\n")
  const [init] = cliCommands
  if (init) io.out(`  ${init.name.padEnd(10)} ${init.says}\n  ${"".padEnd(10)} naima ${init.usage}`)
  if (!ctx) {
    io.out(`\nno ${CONFIG_FILE} found here or above — run naima init`)
    return 0
  }
  for (const c of ctx.registry.commands.values()) io.out(`  ${c.name.padEnd(10)} ${c.says}\n  ${"".padEnd(10)} naima ${c.usage}`)
  return 0
}

export async function runCli(argv: string[], opts: CliOptions): Promise<number> {
  const io = opts.io ?? consoleIO
  const [command] = argv
  const args = argv.slice(1)
  try {
    if (command === "init") {
      if (args.length) throw new Error("usage: naima init")
      return init(opts, io)
    }
    const root = findRoot(opts.cwd)
    const ctx = root ? await openProject(root, opts, io) : null
    if (!command || command === "help" || command === "--help" || command === "-h") return help(ctx, io)
    if (!ctx) throw new Error(`no ${CONFIG_FILE} found here or above — run naima init`)
    const cmd = ctx.registry.commands.get(command)
    if (!cmd) throw new Error(`unknown command "${command}" — naima help`)
    return await cmd.run(args, ctx)
  } catch (e) {
    io.err(`naima: ${(e as Error).message}`)
    return 2
  }
}
