// The launcher: the one piece of Naima that runs with every permission, and
// all it does is work out where things are, then run the program under Deno
// with only these (docs/install.md says why each one exists):
//
//   read    the repository, and the program wherever it is
//   write   the tracker folder (naima-tracker/), and the data and program if moved out of it
//   run     git, and nothing else
//   env     an allow-list of the environment (ENV below): what git needs, and Naima's own
//   net     none: the network is git's, for alignment and update
//
// When the program exits with RELAUNCH it has just aligned the program
// directory, so the code on disk is not the code that ran: the launcher runs
// the program directory's own code, which is the locked commit.

import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  DATA_FILE,
  EXCLUDE_FILES,
  findData,
  globalOptions,
  message,
  PROGRAM_DIR,
  programOf,
  real,
  RELAUNCH,
  toplevel,
  TRACKER_DIR,
  trackerOf,
} from "./core/index.ts"

/** Alignment, an update and its migration: at most three hand-overs, and one to spare. */
const MAX_RUNS = 4

/**
 * The environment the program is handed; nothing else reaches it, nor the git
 * it runs. Naima reads only NAIMA_*; the rest is what git, ssh and a proxy
 * need to reach a source, and what Deno needs to run. Deno cannot grant a
 * named list and still let node:child_process hand git its environment, so
 * the list is enforced by giving the program only these variables.
 */
export const ENV = {
  names: [
    "HOME",
    "USER",
    "LOGNAME",
    "PATH",
    "SHELL",
    "TERM",
    "LANG",
    "TZ",
    "TMPDIR",
    "TMP",
    "TEMP",
    "NO_COLOR",
    "FORCE_COLOR",
    "DISPLAY",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
    "GNUPGHOME",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "HOMEDRIVE",
    "HOMEPATH",
    "PROGRAMDATA",
  ],
  prefixes: ["NAIMA_", "GIT_", "SSH_", "LC_", "DENO_"],
} as const

/** The variables of `env` the program may see: ENV's names and prefixes, compared as Windows does, without case. */
export function allowedEnv(env: Record<string, string>): Record<string, string> {
  const names = new Set<string>(ENV.names)
  const keep = (name: string): boolean => names.has(name.toUpperCase()) || ENV.prefixes.some((p) => name.toUpperCase().startsWith(p))
  return Object.fromEntries(Object.entries(env).filter(([name]) => keep(name)))
}

/** The permissions the program runs with, as Deno flags. Throws when a path cannot be said in one: Deno splits the lists on commas. */
export function permissions(p: { root: string; tracker: string; data: string | null; program: string; entry: string; hostFiles?: string[] }): string[] {
  const list = (paths: (string | null)[]) => {
    const all = [...new Set(paths.filter((x): x is string => x !== null).map(real))]
    const comma = all.find((x) => x.includes(","))
    if (comma) {
      throw new Error(
        `the path ${comma} holds a comma, which Deno's permission flags cannot express (they split on commas) — move the project, or the program, to a path without one`,
      )
    }
    return all.join(",")
  }
  return [
    `--allow-read=${list([p.root, p.data, p.program, p.entry])}`,
    `--allow-write=${list([p.tracker, p.data, p.program, ...(p.hostFiles ?? [])])}`,
    "--allow-run=git",
    "--allow-env",
  ]
}

/** The host files the run may write outside the tracker folder: only `init --write-excludes` has any. */
function hostFiles(rest: string[], root: string): string[] {
  const [command, ...args] = rest
  return command === "init" && args.includes("--write-excludes") ? EXCLUDE_FILES.map((f) => join(root, f)) : []
}

export async function launch(args: string[], cwd: string): Promise<number> {
  let parsed: ReturnType<typeof globalOptions>
  try {
    parsed = globalOptions(args)
  } catch {
    parsed = { rest: args } // the program says what is wrong with the arguments
  }
  const own = dirname(dirname(fileURLToPath(import.meta.url)))
  const data = findData(cwd, parsed.data ?? Deno.env.get("NAIMA_DATA"))
  const root = toplevel(data ?? cwd) ?? resolve(cwd)
  const tracker = data ? trackerOf(data) : join(root, TRACKER_DIR)
  const program = data && existsSync(join(data, DATA_FILE)) ? programOf(data) : join(tracker, PROGRAM_DIR)
  const env = { ...allowedEnv(Deno.env.toObject()), NAIMA_LAUNCHED: "1", ...(data ? { NAIMA_DATA: data } : {}) }
  let entry = existsSync(join(program, "src", "cli.ts")) ? program : own
  for (let run = 0; run < MAX_RUNS; run++) {
    let flags: string[]
    try {
      flags = permissions({ root, tracker, data, program, entry, hostFiles: hostFiles(parsed.rest, root) })
    } catch (e) {
      console.error(`naima: ${message(e)}`)
      return 2
    }
    const child = new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-prompt", "--no-config", "--no-lock", ...flags, join(entry, "src", "cli.ts"), ...args],
      cwd,
      clearEnv: true,
      env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }).spawn()
    const { code } = await child.status
    if (code !== RELAUNCH) return code
    entry = program
  }
  console.error(`naima: ${program} did not settle after ${MAX_RUNS} runs — its alignment keeps moving`)
  return 2
}
