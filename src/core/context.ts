// The object every command, check and view receives.

import { join } from "node:path"
import { NAIMA_DIR } from "./config.ts"
import { loadRepo } from "./repo.ts"
import type { Config, Context, Registry, Repo } from "./types.ts"

export interface IO {
  out(line?: string): void
  err(line: string): void
  now(): Date
}

export const consoleIO: IO = {
  out: (line = "") => process.stdout.write(line + "\n"),
  err: (line) => process.stderr.write(line + "\n"),
  now: () => new Date(),
}

export function createContext(root: string, config: Config, registry: Registry, io: IO = consoleIO): Context {
  const trackerRoot = join(root, NAIMA_DIR)
  let repo: Repo | null = null
  return {
    root,
    trackerRoot,
    config,
    registry,
    get repo() {
      repo ??= loadRepo(trackerRoot, registry)
      return repo
    },
    reload() {
      repo = null
    },
    out: io.out,
    err: io.err,
    now: io.now,
  }
}
