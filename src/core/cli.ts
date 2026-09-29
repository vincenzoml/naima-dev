// The one entry point: find the project, load its plugins, dispatch.

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parse, str } from "./args.ts"
import { corePlugin } from "./base.ts"
import { CONFIG_FILE, findRoot, loadPlugins, readConfig } from "./config.ts"
import { type IO, consoleIO, createContext } from "./context.ts"
import { writeJson } from "./item.ts"
import { buildRegistry } from "./registry.ts"
import type { Context, PluginEntry, PluginFactory } from "./types.ts"

export interface CliOptions {
  cwd: string
  builtins: Record<string, PluginFactory>
  /** What `naima init` writes into a new config. */
  defaultPlugins: string[]
  io?: IO
}

/** Load a project into a context: config, plugins, registry. */
export async function openProject(root: string, builtins: Record<string, PluginFactory>, io: IO = consoleIO): Promise<Context> {
  const config = readConfig(root)
  const plugins = await loadPlugins(root, config, builtins)
  return createContext(root, config, buildRegistry([corePlugin, ...plugins]), io)
}

function init(args: string[], opts: CliOptions, io: IO): number {
  const p = parse(args, { "tracker-dir": { type: "string" } })
  const root = resolve(opts.cwd)
  if (existsSync(join(root, CONFIG_FILE))) throw new Error(`${CONFIG_FILE} already exists here`)
  const trackerDir = str(p, "tracker-dir") ?? "tracker"
  const plugins: PluginEntry["name"][] = opts.defaultPlugins
  writeJson(join(root, CONFIG_FILE), { trackerDir, plugins })
  mkdirSync(join(root, trackerDir), { recursive: true })
  const readme = join(root, trackerDir, "README.md")
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      "# Tracker\n\nOne directory per item: `README.md` for the prose, `meta.json` for the fields,\n" +
        "`attachments/` for the evidence. Boards are derived on demand and never stored.\n\n" +
        "```sh\nnaima new <type> \"<title>\"\nnaima board <type>\nnaima check\n```\n",
    )
  }
  io.out(`wrote ${CONFIG_FILE} and ${trackerDir}/ — plugins: ${plugins.join(", ")}`)
  return 0
}

function help(ctx: Context | null, io: IO): number {
  io.out("usage: naima <command> [args]\n")
  io.out(`  ${"init".padEnd(10)} create ${CONFIG_FILE} and the tracker directory`)
  if (!ctx) {
    io.out(`\nno ${CONFIG_FILE} found here or above — run naima init`)
    return 0
  }
  for (const c of ctx.registry.commands.values()) io.out(`  ${c.name.padEnd(10)} ${c.says}\n  ${"".padEnd(10)} naima ${c.usage}`)
  return 0
}

export async function runCli(argv: string[], opts: CliOptions): Promise<number> {
  const io = opts.io ?? consoleIO
  const [command, ...args] = argv
  try {
    if (command === "init") return init(args, opts, io)
    const root = findRoot(opts.cwd)
    const ctx = root ? await openProject(root, opts.builtins, io) : null
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
