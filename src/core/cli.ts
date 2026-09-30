// The one entry point: find the data, align the program when the launcher
// runs it, load every plugin, dispatch. The commands that set up and move the
// program itself — init, update, carry, guide, help — are answered here,
// before any plugin is loaded.

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { corePlugin } from "./base.ts"
import { CARRY_MODES, type Lock, loadPlugins, parseLock, posixRelative, programDir, readConfig, readRaw, sourceRefusal, writeRaw } from "./config.ts"
import { type IO, type Place, consoleIO, createContext } from "./context.ts"
import { FORMAT, formatRefusal, isFormat, migrate } from "./format.ts"
import { bool, parse } from "./args.ts"
import { gitOrNull, toplevel } from "./git.ts"
import { exclusions } from "./excludes.ts"
import { DATA_DIR, DATA_FILE, DEFAULT_DATA, DIST_BRANCH, PROGRAM_DIR, RELAUNCH, TRACKER_DIR, TRACKER_README, findData, globalOptions, real, trackerOf } from "./layout.ts"
import { type Target, align, carry, ignoreProgram, localWork, refuseLocalWork, remoteHead, short, stage, vendor } from "./program.ts"
import { EXIT, isInternal, message } from "./errors.ts"
import { buildRegistry } from "./registry.ts"
import type { Carry, Command, Config, Context, Plugin } from "./types.ts"

export interface CliOptions {
  cwd: string
  /** The Naima that is running: the directory holding its naima.ts and src/. */
  programRoot: string
  /** The data directory named by `NAIMA_DATA`, if any; `--data` wins over it. */
  data?: string
  /** Run by the launcher: align the program first, and ask to be run again when the code on disk is not the code running. */
  launched?: boolean
  /** Every first-party plugin, built from the config. All of them are always loaded. */
  firstParty: (config: Config) => Plugin[]
  io?: IO
  /** Print the stack of an internal error (NAIMA_DEBUG=1). */
  debug?: boolean
}

/** Load a project into a context: config (in this Naima's format), plugins, registry. */
export async function openProject(place: Place, opts: Pick<CliOptions, "programRoot" | "firstParty">, io: IO = consoleIO): Promise<Context> {
  const config = readConfig(place.data)
  const firstParty = opts.firstParty(config)
  const extra = await loadPlugins(opts.programRoot, config, firstParty.map((p) => p.name))
  return createContext(place, config, buildRegistry([corePlugin, ...firstParty, ...extra], { reserved: cliCommands.map((c) => c.name) }), io)
}

/** The commands the entry point answers itself, before any plugin is loaded. Documented like any other. */
export const cliCommands: Omit<Command, "run">[] = [
  {
    name: "init",
    says: `make this git repository a Naima project: create ${TRACKER_DIR}/ — its README.md, its .gitignore and ${DATA_DIR}/${DATA_FILE}, locked to the source and commit of the Naima that runs it, which must be committed and pushed; print the line that keeps the program out of each host tool configuration it finds (deno.json, tsconfig.json, .prettierignore); nothing outside ${TRACKER_DIR}/ is touched unless --write-excludes is given`,
    usage: "init [--write-excludes]",
    options: [{ name: "--write-excludes", says: "also write those lines into the host's own files: deno.json and tsconfig.json when they are plain JSON, .prettierignore; a file with comments is left to be edited by hand" }],
    examples: ["init", "init --write-excludes"],
  },
  {
    name: "update",
    says: `move the lock to the head of the source's ${DIST_BRANCH} branch — its main, when the source publishes no ${DIST_BRANCH}: fetch it, migrate the data forward if its format moved, and record the new commit, as one change to commit; the only command that asks the source anything`,
    usage: "update [--check]",
    options: [{ name: "--check", says: `only say whether the source's ${DIST_BRANCH} (or main) has moved past the locked commit; exit 1 when it has` }],
    examples: ["update --check", "update"],
  },
  {
    name: "carry",
    says: "switch how the program is carried — a gitignored clone, vendored as committed files, or a git submodule — staging the switch as one change",
    usage: `carry <${CARRY_MODES.join("|")}>`,
    examples: ["carry vendored", "carry clone"],
  },
  {
    name: "guide",
    says: "print where the running Naima's documentation is: the skill, the docs index, the flows, the format, installing; read them as files",
    usage: "guide",
    examples: ["guide"],
  },
  {
    name: "help",
    says: "list every command the loaded plugins provide, with its usage",
    usage: "help",
    examples: ["help"],
  },
]

const usage = (name: string): string => `usage: naima ${cliCommands.find((c) => c.name === name)?.usage ?? name}`

/** The commit of the running Naima, when it is a clone of its own; null when it is vendored into a project. */
function runningCommit(programRoot: string): string | null {
  return toplevel(programRoot) === real(programRoot) ? gitOrNull(programRoot, "rev-parse", "HEAD") : null
}

function locate(opts: CliOptions, flag: string | undefined): (Place & { lock: Lock; raw: Record<string, unknown> }) | null {
  const found = findData(opts.cwd, flag ?? opts.data)
  if (!found) return null
  if (!existsSync(join(found, DATA_FILE))) throw new Error(`${found} holds no ${DATA_FILE}`)
  const data = real(found) // as git names the root: relative paths between the two must not cross a symlink
  const raw = readRaw(data)
  if (!isFormat(raw["format"])) throw new Error(`${DATA_FILE} ${formatRefusal(raw["format"])}`)
  const lock = parseLock(raw)
  return { root: toplevel(data) ?? dirname(dirname(data)), data, program: programDir(data, lock), lock, raw }
}

const targetOf = (place: Place, lock: Lock): Target => ({ root: place.root, tracker: trackerOf(place.data), program: place.program, source: lock.source, commit: lock.commit, carry: lock.carry })

/** A URL with its credentials removed: a token in a clone's origin must never reach a committed naima.json. */
export function withoutCredentials(source: string): string {
  return source.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^@/]*)@/i, (all, scheme: string, userinfo: string) => {
    if (/^https?:\/\/$/i.test(scheme)) return scheme
    return userinfo.includes(":") ? `${scheme}${userinfo.slice(0, userinfo.indexOf(":"))}@` : all
  })
}

/** The command init names as the next step: a type the loaded plugins really let one create. */
async function nextStep(place: Place, opts: CliOptions, io: IO): Promise<string> {
  try {
    const ctx = await openProject(place, opts, io)
    const type = [...ctx.registry.types.values()].find((t) => t.creatable !== false)
    return type ? `next: naima new ${type.id} "<the first thing to do>"` : "next: naima help"
  } catch {
    return "next: naima check" // it says what is wrong with the project
  }
}

/** Print, and with --write-excludes write, the lines that keep the program out of the host's own tools. */
function excludeHost(root: string, program: string, write: boolean, io: IO): void {
  for (const x of exclusions(root, posixRelative(root, program))) {
    if (x.present) continue
    if (!write) io.out(`exclude from ${x.file}: ${x.line}   (naima init --write-excludes adds it)`)
    else if (x.write()) io.out(`wrote ${x.file}: ${x.line}`)
    else io.out(`not written, it is not plain JSON — add by hand to ${x.file}: ${x.line}`)
  }
}

async function init(args: string[], opts: CliOptions, io: IO): Promise<number> {
  const write = bool(parse(args, { "write-excludes": { type: "boolean" } }), "write-excludes")
  const root = toplevel(resolve(opts.cwd))
  if (!root) throw new Error("not a git repository — naima init makes a git repository a Naima project")
  const tracker = join(root, TRACKER_DIR)
  const data = join(tracker, DATA_DIR)
  const program = join(tracker, PROGRAM_DIR)
  if (existsSync(join(data, DATA_FILE))) {
    io.out(`${DEFAULT_DATA}/${DATA_FILE} already exists — left as it is`)
    excludeHost(root, programDir(data, parseLock(readRaw(data))), write, io)
    io.out(await nextStep({ root, data: real(data), program: programDir(data, parseLock(readRaw(data))) }, opts, io))
    return 0
  }
  const commit = runningCommit(opts.programRoot)
  const origin = commit && gitOrNull(opts.programRoot, "remote", "get-url", "origin")
  if (!commit || !origin) {
    throw new Error(`this Naima is not a clone with an origin: naima init records the source and commit of the Naima that runs it — git clone --branch ${DIST_BRANCH} <source> ${TRACKER_DIR}/naima, and run init from there`)
  }
  const source = withoutCredentials(origin)
  const refusal = sourceRefusal(source)
  if (refusal) throw new Error(`the origin of ${opts.programRoot} cannot be a lock's source: it ${refusal}`)
  // Everyone else must be able to fetch what is locked: nothing uncommitted, nothing its origin lacks.
  const work = localWork({ root, tracker, program: opts.programRoot, source, commit, carry: "clone" })
  if (work) throw new Error(`the Naima that runs init has ${work}, so nobody else could run the commit it would lock — push it to its origin, or clone a pushed one`)
  mkdirSync(data, { recursive: true })
  const readme = join(tracker, "README.md")
  if (!existsSync(readme)) writeFileSync(readme, TRACKER_README)
  writeRaw(data, { format: FORMAT, source, commit, carry: "clone" })
  ignoreProgram({ root, tracker, program, source, commit, carry: "clone" }, true)
  io.out(`wrote ${TRACKER_DIR}/: README.md, .gitignore, ${DATA_DIR}/${DATA_FILE} — locked to ${source} at ${short(commit)}`)
  excludeHost(root, program, write, io)
  io.out(await nextStep({ root, data: real(data), program }, opts, io))
  return 0
}

function update(args: string[], place: Place, lock: Lock, raw: Record<string, unknown>, io: IO): number {
  const check = bool(parse(args, { check: { type: "boolean" } }), "check")
  const t = targetOf(place, lock)
  const head = remoteHead(t)
  const main = head.commit
  if (check) {
    if (main === lock.commit) io.out(`current: the source's ${head.branch} is the locked commit ${short(main)}`)
    else io.out(`the source's ${head.branch} moved: ${short(lock.commit)} → ${short(main)} — naima update`)
    return main === lock.commit ? 0 : 1
  }
  if (main !== lock.commit) {
    // Move the program first, and only then the lock: a refusal leaves both where they were.
    if (lock.carry === "vendored") {
      refuseLocalWork(t)
      vendor(t, main)
    } else align({ ...t, commit: main })
    writeRaw(place.data, { ...raw, commit: main })
    io.out(`locked ${short(lock.commit)} → ${short(main)}`)
    return RELAUNCH // the new Naima finishes: it is the one that knows the new format
  }
  const from = raw["format"]
  const migrated = migrate(place.data)
  io.out(migrated.length ? `migrated the data from format ${String(from)} to ${FORMAT}` : `the data is format ${FORMAT}: nothing to migrate`)
  const tracker = posixRelative(place.root, trackerOf(place.data))
  io.out(`${short(main)} is the lock — commit it as one change: git add ${tracker} && git commit -m "Update Naima to ${short(main)}"`)
  return 0
}

function carryCommand(args: string[], place: Place, lock: Lock, raw: Record<string, unknown>, io: IO): number {
  const [to, ...extra] = parse(args).positionals
  if (!to || extra.length || !CARRY_MODES.includes(to as Carry)) throw new Error(usage("carry"))
  if (to === lock.carry) {
    io.out(`already carried as ${to}`)
    return 0
  }
  carry(targetOf(place, lock), to as Carry)
  writeRaw(place.data, { ...raw, carry: to })
  stage(place.root, join(place.data, DATA_FILE))
  io.out(`carried as ${to} (was ${lock.carry}), staged — commit it as one change: git commit -m "Carry Naima as ${to}"`)
  return 0
}

/** What `naima guide` points at, from the program root: all of it ships in the dist. */
export const GUIDE_PAGES: readonly (readonly [string, string])[] = [
  ["skill", "skills/naima/SKILL.md"],
  ["index", "docs/README.md"],
  ["flows", "docs/flows/README.md"],
  ["format", "docs/format.md"],
  ["install", "docs/install.md"],
]

function guide(opts: CliOptions, io: IO): number {
  const at = (path: string): string => relative(opts.cwd, join(opts.programRoot, path)) || "."
  const commit = runningCommit(opts.programRoot)
  io.out(`Naima ${commit ? commit.slice(0, 12) : "(vendored)"}, data format ${FORMAT}, at ${at("")}`)
  io.out("Read these as files; they are the documentation of the Naima that runs:")
  for (const [name, path] of GUIDE_PAGES) io.out(`  ${name.padEnd(8)} ${at(path)}`)
  return 0
}

function help(ctx: Context | null, io: IO): number {
  io.out("usage: naima [--data <dir>] <command> [args]\n")
  const entry = cliCommands.filter((c) => c.name !== "help")
  for (const c of entry) io.out(`  ${c.name.padEnd(10)} ${c.says}\n  ${"".padEnd(10)} naima ${c.usage}`)
  if (!ctx) {
    io.out(`\nno ${DEFAULT_DATA}/${DATA_FILE} found here or above — run naima init`)
    return 0
  }
  for (const c of ctx.registry.commands.values()) io.out(`  ${c.name.padEnd(10)} ${c.says}\n  ${"".padEnd(10)} naima ${c.usage}`)
  return 0
}

const isHelp = (command: string | undefined): boolean => !command || command === "help" || command === "--help" || command === "-h"

export async function runCli(argv: string[], opts: CliOptions): Promise<number> {
  const io = opts.io ?? consoleIO
  try {
    const { data, rest } = globalOptions(argv)
    const [command, ...args] = rest
    if (command === "init") {
      if (args.some((a) => a !== "--write-excludes")) throw new Error(usage("init"))
      return await init(args, opts, io)
    }
    if (command === "guide") return guide(opts, io)
    const place = locate(opts, data)
    if (!place) {
      if (isHelp(command)) return help(null, io)
      throw new Error(`no ${DEFAULT_DATA}/${DATA_FILE} found here or above — run naima init`)
    }
    if (opts.launched) {
      const moved = align(targetOf(place, place.lock))
      if (moved || real(opts.programRoot) !== real(place.program)) return RELAUNCH
    }
    if (command === "update" || command === "carry") {
      if (!opts.launched) throw new Error(`naima ${command} moves the program, so it runs through the launcher: deno run -A ${TRACKER_DIR}/naima/naima.ts ${command}`)
      return command === "update" ? update(args, place, place.lock, place.raw, io) : carryCommand(args, place, place.lock, place.raw, io)
    }
    const ctx = await openProject(place, opts, io)
    if (isHelp(command)) return help(ctx, io)
    const cmd = ctx.registry.commands.get(command as string)
    if (!cmd) throw new Error(`unknown command "${command}" — naima help`)
    const code = await cmd.run(args, ctx)
    if (code !== RELAUNCH) return code
    // Only the entry point asks for a relaunch; a command's 75 would make the launcher run it again.
    io.err(`naima: ${command} exited ${RELAUNCH}, the code reserved for asking the launcher to relaunch — reported as ${EXIT.FAILED}`)
    return EXIT.FAILED
  } catch (e) {
    if (!isInternal(e)) {
      io.err(`naima: ${message(e)}`)
      return EXIT.USAGE
    }
    const name = e instanceof Error ? `${e.name}: ` : ""
    io.err(`naima: internal error: ${name}${message(e)} — a bug in Naima or a plugin; NAIMA_DEBUG=1 prints where`)
    if (opts.debug && e instanceof Error && e.stack) io.err(e.stack)
    return EXIT.INTERNAL
  }
}
