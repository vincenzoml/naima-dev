// State that belongs to no branch, read from all of them.
//
// Some records (who is on what, where a session left off) are written as one
// file per session on that session's own branch, so no two sessions ever
// write the same path. The collection is never stored: it is recombined at
// read time from every ref worth reading. Nothing in this module writes.

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { isRegularFile, walkFiles } from "./files.ts"

let calls = 0
/** How many git processes this module has started: what the cost of a cross-branch read is measured in. */
export const gitCalls = (): number => calls

/** One git run: whether it succeeded, what it printed, and whether git could be started at all. */
export interface GitRun {
  ok: boolean
  /** Standard output, its final newline removed. */
  out: string
  err: string
  /** Git itself could not be started: not installed, or not on PATH. */
  notInstalled: boolean
}

export interface GitOptions {
  /** Written to git's standard input. */
  input?: string
  /** Added to the environment git runs with. */
  env?: Record<string, string>
}

function spawnGit(cwd: string, args: string[], opts: GitOptions, encoding: "utf8" | "buffer") {
  calls++
  return spawnSync("git", args, {
    cwd,
    ...(encoding === "utf8" ? { encoding } : {}), // no encoding: bytes (Node refuses an explicit "buffer")
    ...(opts.input !== undefined ? { input: opts.input } : {}),
    ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
    stdio: [opts.input !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
    maxBuffer: 1 << 28,
  })
}

/** The one way the program runs git. Never throws: the result says what happened. */
export function runGit(cwd: string, args: string[], opts: GitOptions = {}): GitRun {
  const r = spawnGit(cwd, args, opts, "utf8")
  const notInstalled = (r.error as { code?: string } | undefined)?.code === "ENOENT"
  return { ok: r.status === 0, out: String(r.stdout ?? "").replace(/\r?\n$/, ""), err: String(r.stderr ?? "").trim(), notInstalled }
}

/** Why a run failed, in one line: git's own first line, or that git is not there. */
export function gitReason(r: GitRun): string {
  if (r.notInstalled) return "git is not installed, or not on PATH"
  return r.err.split("\n").find((l) => l.trim())?.replace(/^(fatal|error): /, "") ?? "git failed"
}

/** Git's trimmed output, or null when it fails: for questions whose failure is an answer ("is this a repository?"). */
export function gitOrNull(cwd: string, ...args: string[]): string | null {
  const r = runGit(cwd, args)
  return r.ok ? r.out.trim() : null
}

/** Git's trimmed output; an error naming the subcommand and git's reason when it fails. */
export function mustGit(cwd: string, ...args: string[]): string {
  const r = runGit(cwd, args)
  if (!r.ok) throw new Error(`git ${args[0]}: ${gitReason(r)}`)
  return r.out.trim()
}

/** A path as git reads and writes it: forward slashes, whatever the platform's separator. */
export const gitPath = (path: string, separator: string = sep): string => path.split(separator).join("/")

export function isGitRepo(root: string): boolean {
  return gitOrNull(root, "rev-parse", "--is-inside-work-tree") === "true"
}

/** The root of the git working tree holding `dir`, or null outside git. */
export function toplevel(dir: string): string | null {
  return gitOrNull(dir, "rev-parse", "--show-toplevel")
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
  const listed = isGitRepo(root) ? gitOrNull(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard") : null
  if (listed !== null) return [...new Set(listed.split("\0").filter((f) => f && mine(f) && isRegularFile(join(root, f))))].sort()
  return walkFiles(root, { skipHidden: true })
    .map((path) => gitPath(relative(root, path)))
    .filter(mine)
}

export function currentBranch(root: string): string {
  return gitOrNull(root, "rev-parse", "--abbrev-ref", "HEAD") ?? "HEAD"
}

/**
 * The trunk: the local branch origin's HEAD names, else `main`, else
 * `master`; null when there is none of them. One git process.
 */
export function trunk(root: string): string | null {
  const refs = new Map<string, string>()
  for (const line of (gitOrNull(root, "for-each-ref", "--format=%(refname) %(symref)", "refs/remotes/origin/HEAD", "refs/heads/main", "refs/heads/master") ?? "").split("\n")) {
    const [name, target = ""] = line.trim().split(" ")
    if (name) refs.set(name, target)
  }
  const origin = refs.get("refs/remotes/origin/HEAD")?.replace(/^refs\/remotes\/origin\//, "")
  if (origin && gitOrNull(root, "rev-parse", "--verify", "--quiet", `refs/heads/${origin}`) !== null) return origin
  return refs.has("refs/heads/main") ? "main" : refs.has("refs/heads/master") ? "master" : null
}

/** Every local and remote branch name, with remote prefixes also stripped. Answers "does this branch still exist". */
export function allRefNames(root: string): Set<string> {
  const out = new Set<string>()
  for (const line of (gitOrNull(root, "for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes") ?? "").split("\n")) {
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
  for (const line of (gitOrNull(root, "for-each-ref", "--format=%(refname:short)", ...branches) ?? "").split("\n")) {
    if (line.trim()) refs.add(line.trim())
  }
  const self = realOr(root)
  for (const block of (gitOrNull(root, "worktree", "list", "--porcelain") ?? "").split("\n\n")) {
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
  const r = spawnGit(root, ["cat-file", "--batch"], { input: names.join("\n") + "\n" }, "buffer")
  if (r.status !== 0 || !Buffer.isBuffer(r.stdout)) return names.map(() => null)
  const out = r.stdout
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

/**
 * Every `ext` file directly under `dir` on each ref, and the names this
 * worktree's HEAD holds there: one batch lists the trees, one reads the files.
 */
function filesOnRefs(root: string, refs: string[], dir: string, ext: string): { onRefs: BranchFile[][]; onHead: Set<string> } {
  const files = (t: { type: string; data: Buffer } | null | undefined) =>
    t?.type === "tree" ? treeEntries(t.data).filter((e) => e.mode.startsWith("100") && e.name.endsWith(ext)) : []
  const [head, ...trees] = objects(root, [`HEAD:${dir}`, ...refs.map((ref) => `${ref}:${dir}`)])
  const listed = trees.map(files)
  const blobs = objects(root, listed.flat().map((e) => e.sha))
  let next = 0
  const onRefs = refs.map((ref, i) =>
    (listed[i] ?? []).flatMap((e) => {
      const blob = blobs[next++]
      return blob?.type === "blob" ? [{ ref, name: e.name, text: blob.data.toString("utf8"), local: false }] : []
    }),
  )
  return { onRefs, onHead: new Set(files(head).map((e) => e.name)) }
}

export function filesHere(root: string, dir: string, ext: string, ref: string): BranchFile[] {
  const abs = join(root, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs)
    .filter((n) => n.endsWith(ext))
    .sort()
    .map((name) => ({ ref, name, text: readFileSync(join(abs, name), "utf8"), local: true }))
}

/** Every `ext` file directly under `dir` on one ref (`HEAD` included), as committed there. */
export function filesAt(root: string, ref: string, dir: string, ext: string): BranchFile[] {
  return isGitRepo(root) ? (filesOnRefs(root, [ref], gitPath(dir), ext).onRefs[0] ?? []) : []
}

export interface AcrossOptions {
  /**
   * The branch a record says it belongs to. A copy on this worktree's disk of
   * another branch's record — the trunk carrying a claim merged from it — is
   * older than that branch's own: the branch's version wins.
   */
  owner?: (file: BranchFile) => string | undefined
}

/**
 * Every file under `dir` (relative to `root`) on every ref worth reading, one
 * entry per file name. The branch this worktree stands on is read from disk,
 * not from its ref: the working tree is the newer truth, so a record written
 * and not yet committed is seen, and one deleted and not yet committed is not
 * — on any ref. A record another branch owns is read from that branch.
 */
export function readAcrossBranches(root: string, dir: string, ext: string, opts: AcrossOptions = {}): BranchFile[] {
  const seen = new Map<string, BranchFile>()
  const byRef = new Map<string, Map<string, BranchFile>>()
  const inGit = gitPath(dir) // a ref's tree is read with forward slashes: a Windows path would name nothing
  const here = currentBranch(root)
  const local = filesHere(root, dir, ext, here)
  const onDisk = new Set(local.map((f) => f.name))
  if (isGitRepo(root)) {
    const refs = refsWorthReading(root).filter((ref) => ref !== here)
    const { onRefs, onHead } = filesOnRefs(root, refs, inGit, ext)
    for (const files of onRefs) {
      for (const f of files) {
        if (onHead.has(f.name) && !onDisk.has(f.name)) continue // deleted here, not yet committed: gone everywhere
        if (!seen.has(f.name)) seen.set(f.name, f)
        const mine = byRef.get(f.ref) ?? new Map<string, BranchFile>()
        byRef.set(f.ref, mine.set(f.name, f))
      }
    }
  }
  for (const f of local) {
    const owner = opts.owner?.(f)
    const owners = owner !== undefined && owner !== here ? byRef.get(owner)?.get(f.name) : undefined
    seen.set(f.name, owners ?? f)
  }
  return [...seen.values()]
}
