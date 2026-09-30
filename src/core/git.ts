// State that belongs to no branch, read from all of them.
//
// Some records (who is on what, where a session left off) are written as one
// file per session on that session's own branch, so no two sessions ever
// write the same path. The collection is never stored: it is recombined at
// read time from every ref worth reading. Nothing in this module writes.

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { isRegularFile, walkFiles } from "./files.ts"

let calls = 0
/** How many git processes this module has started: what the cost of a cross-branch read is measured in. */
export const gitCalls = (): number => calls

/** Git's trimmed output, or null when it fails. */
export function git(root: string, ...args: string[]): string | null {
  calls++
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }).trim()
  } catch {
    return null
  }
}

/** A path as git reads and writes it: forward slashes, whatever the platform's separator. */
export const gitPath = (path: string, separator: string = sep): string => path.split(separator).join("/")

export function isGitRepo(root: string): boolean {
  return git(root, "rev-parse", "--is-inside-work-tree") === "true"
}

/** The root of the git working tree holding `dir`, or null outside git. */
export function toplevel(dir: string): string | null {
  return git(dir, "rev-parse", "--show-toplevel")
}

/**
 * The project's own files, relative to the root and with forward slashes on
 * every platform: every regular file git tracks
 * or would track (not ignored) — never a submodule's directory, never a
 * symbolic link — or, outside git, every regular file under the root but
 * hidden directories, node_modules, dist and build. Never a file under
 * `program`: the Naima a project runs is not the project's, even when it is
 * committed. What a plugin scans by default, so that nothing has to be listed
 * for it to be covered.
 */
export function projectFiles(root: string, program?: string): string[] {
  const skip = program ? gitPath(relative(root, program)) + "/" : null
  const mine = (f: string): boolean => !skip || !f.startsWith(skip)
  const listed = isGitRepo(root) ? git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard") : null
  if (listed !== null) return [...new Set(listed.split("\0").filter((f) => f && mine(f) && isRegularFile(join(root, f))))].sort()
  return walkFiles(root, { skipHidden: true })
    .map((path) => gitPath(relative(root, path)))
    .filter(mine)
}

export function currentBranch(root: string): string {
  return git(root, "rev-parse", "--abbrev-ref", "HEAD") ?? "HEAD"
}

/**
 * The trunk: the local branch origin's HEAD names, else `main`, else
 * `master`; null when there is none of them. One git process.
 */
export function trunk(root: string): string | null {
  const refs = new Map<string, string>()
  for (const line of (git(root, "for-each-ref", "--format=%(refname) %(symref)", "refs/remotes/origin/HEAD", "refs/heads/main", "refs/heads/master") ?? "").split("\n")) {
    const [name, target = ""] = line.trim().split(" ")
    if (name) refs.set(name, target)
  }
  const origin = refs.get("refs/remotes/origin/HEAD")?.replace(/^refs\/remotes\/origin\//, "")
  if (origin && git(root, "rev-parse", "--verify", "--quiet", `refs/heads/${origin}`) !== null) return origin
  return refs.has("refs/heads/main") ? "main" : refs.has("refs/heads/master") ? "master" : null
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

const realOr = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/**
 * The refs worth reading: every local branch not merged into the trunk,
 * whatever each other worktree stands on, and the trunk itself — last, so that
 * a record's own branch is read before the older copy the trunk may carry. A
 * merged branch adds nothing the trunk does not already carry. Without a
 * trunk, every local branch. Never the detached HEAD of this worktree: its
 * disk is read instead.
 */
export function refsWorthReading(root: string): string[] {
  const main = trunk(root)
  const refs = new Set<string>()
  const branches = main ? ["--no-merged", main, "refs/heads"] : ["refs/heads"]
  for (const line of (git(root, "for-each-ref", "--format=%(refname:short)", ...branches) ?? "").split("\n")) {
    if (line.trim()) refs.add(line.trim())
  }
  const self = realOr(root)
  for (const block of (git(root, "worktree", "list", "--porcelain") ?? "").split("\n\n")) {
    const named = block.match(/^branch refs\/heads\/(.+)$/m)?.[1]
    const head = block.match(/^HEAD ([0-9a-f]+)$/m)?.[1]
    const path = block.match(/^worktree (.+)$/m)?.[1]
    if (named) refs.add(named)
    else if (head && (!path || realOr(path) !== self)) refs.add(head)
  }
  if (main) {
    refs.delete(main)
    refs.add(main)
  }
  return [...refs]
}

export interface BranchFile {
  ref: string
  name: string
  text: string
  /** Read from this worktree's disk (committed or not) rather than from a ref. */
  local: boolean
}

/**
 * Git objects by name (`<ref>:<path>`, or a sha), all through one
 * `git cat-file --batch`: each is its type and bytes, or null when git has no
 * such object. One process for any number of objects.
 */
function objects(root: string, names: string[]): ({ type: string; data: Buffer } | null)[] {
  if (!names.length) return []
  calls++
  let out: Buffer
  try {
    out = execFileSync("git", ["cat-file", "--batch"], { cwd: root, input: names.join("\n") + "\n", stdio: ["pipe", "pipe", "ignore"], maxBuffer: 1 << 28 })
  } catch {
    return names.map(() => null)
  }
  const found: ({ type: string; data: Buffer } | null)[] = []
  let at = 0
  for (let i = 0; i < names.length; i++) {
    const eol = out.indexOf(10, at)
    if (eol === -1) break
    const header = out.subarray(at, eol).toString("utf8").split(" ") // "<sha> <type> <size>", or "<name> missing"
    at = eol + 1
    const size = Number(header[2])
    if (header.length !== 3 || !Number.isInteger(size)) {
      found.push(null)
      continue
    }
    found.push({ type: header[1] ?? "", data: out.subarray(at, at + size) })
    at += size + 1 // the content, then a newline
  }
  return found
}

/** The entries of a tree object: `<mode> <name>\0<20-byte sha>`, repeated. */
function treeEntries(tree: Buffer): { mode: string; name: string; sha: string }[] {
  const out: { mode: string; name: string; sha: string }[] = []
  let at = 0
  while (at < tree.length) {
    const space = tree.indexOf(32, at)
    const nul = tree.indexOf(0, space)
    if (space === -1 || nul === -1) break
    out.push({ mode: tree.subarray(at, space).toString("utf8"), name: tree.subarray(space + 1, nul).toString("utf8"), sha: tree.subarray(nul + 1, nul + 21).toString("hex") })
    at = nul + 21
  }
  return out
}

/** Every `ext` file directly under `dir` on each ref: one batch lists the trees, one reads the files. */
function filesOnRefs(root: string, refs: string[], dir: string, ext: string): BranchFile[][] {
  const trees = objects(root, refs.map((ref) => `${ref}:${dir}`))
  const listed = trees.map((t) => (t?.type === "tree" ? treeEntries(t.data).filter((e) => e.mode.startsWith("100") && e.name.endsWith(ext)) : []))
  const blobs = objects(root, listed.flat().map((e) => e.sha))
  let next = 0
  return refs.map((ref, i) =>
    (listed[i] ?? []).flatMap((e) => {
      const blob = blobs[next++]
      return blob?.type === "blob" ? [{ ref, name: e.name, text: blob.data.toString("utf8"), local: false }] : []
    }),
  )
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
  const inGit = gitPath(dir) // a ref's tree is read with forward slashes: a Windows path would name nothing
  const here = currentBranch(root)
  if (isGitRepo(root)) {
    const refs = refsWorthReading(root).filter((ref) => ref !== here)
    for (const files of filesOnRefs(root, refs, inGit, ext)) for (const f of files) if (!seen.has(f.name)) seen.set(f.name, f)
  }
  for (const f of filesHere(root, dir, ext, here)) seen.set(f.name, f)
  return [...seen.values()]
}
