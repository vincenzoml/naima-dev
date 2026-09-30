// The launcher: the one piece of Naima that runs with every permission, and
// all it does is work out where things are, then run the program under Deno
// with only these (docs/install.md says why each one exists):
//
//   read    the repository, and the program wherever it is
//   write   the tracker folder (naima-tracker/), and the data and program if moved out of it
//   run     git, and nothing else
//   env     the environment, which a child process is handed
//   net     none: the network is git's, for alignment and update
//
// When the program exits with RELAUNCH it has just aligned the program
// directory, so the code on disk is not the code that ran: the launcher runs
// the program directory's own code, which is the locked commit.

import { existsSync, readFileSync, realpathSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { DATA_FILE, DEFAULT_PROGRAM, PROGRAM_DIR, RELAUNCH, TRACKER_DIR, findData, toplevel, trackerOf } from "./core/index.ts"

/** Alignment, an update and its migration: at most three hand-overs, and one to spare. */
const MAX_RUNS = 4

const real = (path: string): string => (existsSync(path) ? realpathSync(path) : resolve(path))

/** The `--data` option, which must come first, as the program also reads it. */
function dataOption(args: string[]): string | undefined {
  const [first, second] = args
  if (first === "--data") return second
  return first?.startsWith("--data=") ? first.slice("--data=".length) : undefined
}

function programOf(data: string): string {
  try {
    const raw = JSON.parse(readFileSync(join(data, DATA_FILE), "utf8")) as { program?: unknown }
    return resolve(data, typeof raw.program === "string" ? raw.program : DEFAULT_PROGRAM)
  } catch {
    return resolve(data, DEFAULT_PROGRAM) // the program reports what is wrong with naima.json
  }
}

/** The permissions the program runs with, as Deno flags. */
export function permissions(p: { root: string; tracker: string; data: string | null; program: string; entry: string }): string[] {
  const list = (paths: (string | null)[]) => [...new Set(paths.filter((x): x is string => x !== null).map(real))].join(",")
  return [
    `--allow-read=${list([p.root, p.data, p.program, p.entry])}`,
    `--allow-write=${list([p.tracker, p.data, p.program])}`,
    "--allow-run=git",
    "--allow-env",
  ]
}

export async function launch(args: string[], cwd: string): Promise<number> {
  const own = dirname(dirname(fileURLToPath(import.meta.url)))
  const data = findData(cwd, dataOption(args) ?? Deno.env.get("NAIMA_DATA"))
  const root = toplevel(data ?? cwd) ?? resolve(cwd)
  const tracker = data ? trackerOf(data) : join(root, TRACKER_DIR)
  const program = data && existsSync(join(data, DATA_FILE)) ? programOf(data) : join(tracker, PROGRAM_DIR)
  let entry = existsSync(join(program, "src", "cli.ts")) ? program : own
  for (let run = 0; run < MAX_RUNS; run++) {
    const child = new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-prompt", "--no-config", "--no-lock", ...permissions({ root, tracker, data, program, entry }), join(entry, "src", "cli.ts"), ...args],
      cwd,
      env: { NAIMA_LAUNCHED: "1", ...(data ? { NAIMA_DATA: data } : {}) },
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
