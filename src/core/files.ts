// Walking a directory for the files a plugin scans: one walker, one skip rule.

import { existsSync, lstatSync, readdirSync } from "node:fs"
import { join } from "node:path"

/** Never a project's own source, wherever they sit: version control, dependencies, build output. */
export const NEVER_SOURCE: ReadonlySet<string> = new Set([".git", "node_modules", "dist", "build"])

/** Is `path` a regular file, not a directory, a symbolic link or nothing? */
export function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Every regular file under `path` (or `path` itself, when it is one), sorted,
 * as absolute paths. A symbolic link is never followed, so nothing outside the
 * tree is read; a directory named in NEVER_SOURCE is skipped, and with
 * `skipHidden` so is every name starting with a dot.
 */
export function walkFiles(path: string, opts: { skipHidden?: boolean } = {}): string[] {
  if (!existsSync(path)) return []
  const top = lstatSync(path)
  if (top.isFile()) return [path]
  if (!top.isDirectory()) return []
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (NEVER_SOURCE.has(e.name) || (opts.skipHidden && e.name.startsWith("."))) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.isFile()) out.push(full) // Dirent is lstat's: a symbolic link is neither
    }
  }
  walk(path)
  return out.sort()
}
