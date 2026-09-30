// A throwaway project for tests: a temp directory, a naima.json, a context
// whose output is captured and whose clock is fixed.

import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { corePlugin } from "./base.ts"
import { createContext } from "./context.ts"
import { FORMAT } from "./format.ts"
import { writeJson } from "./item.ts"
import { DATA_FILE, DEFAULT_DATA, DEFAULT_PROGRAM } from "./layout.ts"
import { buildRegistry } from "./registry.ts"
import type { Context, Plugin } from "./types.ts"

export interface TempProject {
  root: string
  ctx: Context
  output: string[]
  errors: string[]
  /** Run a registered command; output lands in `output`. */
  run(command: string, ...args: string[]): Promise<number>
  git(...args: string[]): string
  cleanup(): void
}

export const FIXED_NOW = new Date("2026-01-15T10:00:00.000Z")

export function tempProject(plugins: Plugin[], opts: { git?: boolean; now?: Date } = {}): TempProject {
  const root = mkdtempSync(join(tmpdir(), "naima-"))
  const data = join(root, DEFAULT_DATA)
  const lock = { source: "https://example.invalid/naima.git", commit: "0".repeat(40), carry: "clone" as const, program: DEFAULT_PROGRAM }
  const config = { format: FORMAT, ...lock, gates: {}, plugins: [] }
  writeJson(join(data, DATA_FILE), { format: FORMAT, source: lock.source, commit: lock.commit, carry: lock.carry })
  const output: string[] = []
  const errors: string[] = []
  const now = opts.now ?? FIXED_NOW
  const ctx = createContext({ root, data, program: join(data, DEFAULT_PROGRAM) }, config, buildRegistry([corePlugin, ...plugins]), {
    out: (line = "") => void output.push(line),
    err: (line) => void errors.push(line),
    now: () => now,
  })
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  if (opts.git) {
    git("init", "-q", "-b", "main")
    git("config", "user.email", "test@example.invalid")
    git("config", "user.name", "test")
    git("config", "commit.gpgsign", "false")
    git("add", "-A")
    git("commit", "-q", "-m", "init")
  }
  return {
    root,
    ctx,
    output,
    errors,
    async run(command, ...args) {
      const cmd = ctx.registry.commands.get(command)
      if (!cmd) throw new Error(`no command ${command}`)
      ctx.reload()
      return cmd.run(args, ctx)
    },
    git,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
