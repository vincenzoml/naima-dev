// State that belongs to no branch, read from all of them.
//
// Some records (who is on what, where a session left off) are written as one
// file per session on that session's own branch, so no two sessions ever
// write the same path. The collection is never stored: it is recombined at
// read time from every ref worth reading. Nothing in this module writes.

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { isRegularFile, walkFiles } from "./files.ts"

/** Git's trimmed output, or null when it fails. */
export function git(root: string, ...args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }).trim()
  } catch {
    return null
  }
}

export function isGitRepo(root: string): boolean {
  return git(root, "rev-parse", "--is-inside-work-tree") === "true"
}

/** The root of the git working tree holding `dir`, or null outside git. */
export function toplevel(dir: string): string | null {
  return git(dir, "rev-parse", "--show-toplevel")
}

/**
 * The project's own files, relative to the root: every regular file git tracks
 * or would track (not ignored) — never a submodule's directory, never a
 * symbolic link — or, outside git, every regular file under the root but
 * hidden directories, node_modules, dist and build. Never a file under
 * `program`: the Naima a project runs is not the project's, even when it is
 * committed. What a plugin scans by default, so that nothing has to be listed
 * for it to be covered.
 */
export function projectFiles(root: string, program?: string): string[] {
  const skip = program ? relative(root, program).split(sep).join("/") + "/" : null
  const mine = (f: string): boolean => !skip || !f.split(sep).join("/").startsWith(skip)
  const listed = isGitRepo(root) ? git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard") : null
  if (listed !== null) return [...new Set(listed.split("\0").filter((f) => f && mine(f) && isRegularFile(join(root, f))))].sort()
  return walkFiles(root, { skipHidden: true })
    .map((path) => relative(root, path))
    .filter(mine)
}

export function currentBranch(root: string): string {
  return git(root, "rev-parse", "--abbrev-ref", "HEAD") ?? "HEAD"
}

export function trunk(root: string): string {
  return git(root, "rev-parse", "--verify", "--quiet", "main") !== null ? "main" : "master"
}

/** Every local and remote branch name, with remote prefixes also stripped. Answers "does this branch still exist". */
export function allRefNames(root: string): Set<string> {
  const out = new Set<string>()
  for (const line of (git(root, "for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes") ?? "").split("\n")) {
    const name = line.trim()
    if (!name || name.endsWith("/HEAD")) continue
    out.add(name)
    if (name.includes("/")) out.add(name.replace(/^[^/]+\//, ""))
  }
  return out
}

/**
 * The refs worth reading: every local branch not merged into the trunk,
 * whatever each worktree stands on, and the trunk itself — last, so that a
 * record's own branch is read before the older copy the trunk may carry. A
 * merged branch adds nothing the trunk does not already carry.
 */
export function refsWorthReading(root: string): string[] {
  const main = trunk(root)
  const refs = new Set<string>()
  for (const line of (git(root, "for-each-ref", "--format=%(refname:short)", "--no-merged", main, "refs/heads") ?? "").split("\n")) {
    if (line.trim()) refs.add(line.trim())
  }
  for (const block of (git(root, "worktree", "list", "--porcelain") ?? "").split("\n\n")) {
    const named = block.match(/^branch refs\/heads\/(.+)$/m)?.[1]
    const head = block.match(/^HEAD ([0-9a-f]+)$/m)?.[1]
    if (named) refs.add(named)
    else if (head) refs.add(head)
  }
  refs.delete(main)
  if (git(root, "rev-parse", "--verify", "--quiet", main) !== null) refs.add(main)
  return [...refs]
}

export interface BranchFile {
  ref: string
  name: string
  text: string
  /** Read from this worktree's disk (committed or not) rather than from a ref. */
  local: boolean
}

function filesOn(root: string, ref: string, dir: string, ext: string): BranchFile[] {
  const listing = git(root, "ls-tree", "--name-only", `${ref}:${dir}`)
  if (!listing) return []
  const out: BranchFile[] = []
  for (const name of listing.split("\n")) {
    if (!name.endsWith(ext)) continue
    const text = git(root, "show", `${ref}:${dir}/${name}`)
    if (text !== null) out.push({ ref, name, text, local: false })
  }
  return out
}

export function filesHere(root: string, dir: string, ext: string, ref: string): BranchFile[] {
  const abs = join(root, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs)
    .filter((n) => n.endsWith(ext))
    .sort()
    .map((name) => ({ ref, name, text: readFileSync(join(abs, name), "utf8"), local: true }))
}

/**
 * Every file under `dir` (relative to `root`) on every ref worth reading, one
 * entry per file name. The branch this worktree stands on is read from disk,
 * not from its ref: the working tree is the newer truth, so a record written
 * and not yet committed is seen, and one deleted and not yet committed is not.
 */
export function readAcrossBranches(root: string, dir: string, ext: string): BranchFile[] {
  const seen = new Map<string, BranchFile>()
  const here = currentBranch(root)
  if (isGitRepo(root)) {
    for (const ref of refsWorthReading(root)) {
      if (ref === here) continue
      for (const f of filesOn(root, ref, dir, ext)) if (!seen.has(f.name)) seen.set(f.name, f)
    }
  }
  for (const f of filesHere(root, dir, ext, here)) seen.set(f.name, f)
  return [...seen.values()]
}
