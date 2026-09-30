// A throwaway project for tests: a temp directory, a config, a context whose
// output is captured and whose clock is fixed.

import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { corePlugin } from "./base.ts"
import { CONFIG_FILE } from "./config.ts"
import { createContext } from "./context.ts"
import { writeJson } from "./item.ts"
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
  const config = { pin: "*", gates: {}, plugins: [] }
  writeJson(join(root, CONFIG_FILE), { naima: config.pin })
  const output: string[] = []
  const errors: string[] = []
  const now = opts.now ?? FIXED_NOW
  const ctx = createContext(root, config, buildRegistry([corePlugin, ...plugins]), {
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
