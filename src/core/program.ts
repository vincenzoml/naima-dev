// The program: the Naima a project runs, in naima-tracker/naima/, locked to
// the source and commit naima.json records (docs/format.md#the-lock).
//
// Every operation here goes through git. None ever overwrites work: a program
// directory with uncommitted changes, or with commits its source does not
// have, is refused, never reset. None ever pulls on its own: only `naima
// update` asks the source where its main is.

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { posixRelative } from "./config.ts"
import type { Carry } from "./types.ts"

/** Where a project's program is, and what it is locked to. Paths are absolute. */
export interface Target {
  /** The project's git root. */
  root: string
  /** The tracker folder, `naima-tracker/`: what bounds every write (see trackerOf). */
  tracker: string
  program: string
  source: string
  commit: string
  carry: Carry
}

interface Run {
  ok: boolean
  out: string
  err: string
}

function git(cwd: string, args: string[]): Run {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 })
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() }
}

/** Git's own reason, in one line. */
const reason = (r: Run): string => r.err.split("\n").find((l) => l.trim())?.replace(/^(fatal|error): /, "") ?? "git failed"

function must(cwd: string, ...args: string[]): string {
  const r = git(cwd, args)
  if (!r.ok) throw new Error(`git ${args[0]}: ${reason(r)}`)
  return r.out
}

const has = (repo: string, commit: string): boolean => git(repo, ["cat-file", "-e", `${commit}^{commit}`]).ok
const isRepo = (dir: string): boolean => existsSync(join(dir, ".git"))
const short = (commit: string): string => commit.slice(0, 12)
const where = (t: Target): string => posixRelative(t.root, t.program)

/** A source on this disk rather than behind a URL. */
export const isLocalSource = (source: string): boolean => source.startsWith("file:") || !/^([a-z][a-z0-9+.-]*:\/\/|[^/\\\s]+@[^:/\\\s]+:)/i.test(source)

/** Why the program directory holds work that moving it would destroy, or null. */
export function localWork(t: Target): string | null {
  if (t.carry === "vendored") return git(t.root, ["status", "--porcelain", "--", where(t)]).out ? "uncommitted changes" : null
  if (git(t.program, ["status", "--porcelain"]).out) return "uncommitted changes"
  if (git(t.program, ["rev-list", "-n", "1", "HEAD", "--branches", "--not", "--remotes"]).out) return "commits its source does not have"
  return null
}

export function refuseLocalWork(t: Target): void {
  const work = localWork(t)
  if (work) throw new Error(`${where(t)} has ${work} — publish them as a fork and set source in naima.json; Naima never overwrites them`)
}

/**
 * Repositories on this disk that already hold the locked commit, so a new
 * clone needs no network: the program of the main worktree, when this is
 * another worktree of the project, and the project itself (which holds
 * Naima's commits when the project is Naima).
 */
function seeds(t: Target): string[] {
  const out: string[] = []
  const common = git(t.root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  if (common.ok) {
    const main = dirname(common.out)
    const twin = join(main, posixRelative(t.root, t.program))
    if (resolve(twin) !== resolve(t.program) && isRepo(twin)) out.push(twin)
  }
  out.push(t.root)
  return out.filter((s) => has(s, t.commit))
}

function cloneProgram(t: Target): void {
  const [seed] = seeds(t)
  mkdirSync(dirname(t.program), { recursive: true })
  const r = git(t.root, ["clone", "--quiet", "--no-checkout", seed ?? t.source, t.program])
  if (!r.ok) {
    rmSync(t.program, { recursive: true, force: true })
    throw new Error(`cannot clone ${t.source} into ${where(t)}: ${reason(r)} — the first run needs git and the network`)
  }
  if (seed) must(t.program, "remote", "set-url", "origin", t.source)
}

/**
 * Make the program directory exactly the locked commit of the source,
 * cloning it when it is absent. Returns true when the code on disk changed.
 * Vendored, the committed tree is the lock and there is nothing to align.
 */
export function align(t: Target): boolean {
  if (t.carry === "vendored") {
    if (!existsSync(join(t.program, "naima.ts"))) throw new Error(`${where(t)} is missing: carry is vendored, so it is committed — restore it from git`)
    return false
  }
  const fresh = !isRepo(t.program)
  if (fresh) {
    if (existsSync(t.program) && readdirSync(t.program).length) throw new Error(`${where(t)} exists and is not a clone — move it away, or set carry in naima.json`)
    cloneProgram(t)
  } else {
    refuseLocalWork(t)
    if (git(t.program, ["remote", "get-url", "origin"]).out !== t.source) must(t.program, "remote", "set-url", "origin", t.source)
    if (git(t.program, ["rev-parse", "HEAD"]).out === t.commit) return false
  }
  if (!has(t.program, t.commit)) {
    git(t.program, ["fetch", "--quiet", "origin"])
    if (!has(t.program, t.commit)) git(t.program, ["fetch", "--quiet", "origin", t.commit])
    if (!has(t.program, t.commit)) {
      throw new Error(`commit ${short(t.commit)} cannot be fetched from ${t.source} — its history was rewritten or the source is gone; record a commit it has`)
    }
  }
  must(t.program, "checkout", "--quiet", "--detach", t.commit)
  return true
}

/** The commit the source's main points at. Reads the source; changes nothing. */
export function remoteMain(t: Target): string {
  const r = git(t.root, ["ls-remote", t.source, "refs/heads/main"])
  const commit = r.out.split(/\s/)[0]
  if (!r.ok || !commit) throw new Error(`cannot read main from ${t.source}: ${r.ok ? "it has no main branch" : reason(r)}`)
  return commit
}

/** Vendored: replace the program with the tree of `commit`, fetched from the source into a scratch clone under the tracker folder. */
export function vendor(t: Target, commit: string): void {
  const scratch = join(t.tracker, ".naima-update")
  rmSync(scratch, { recursive: true, force: true })
  try {
    const r = git(t.root, ["clone", "--quiet", "--no-checkout", t.source, scratch])
    if (!r.ok) throw new Error(`cannot clone ${t.source}: ${reason(r)}`)
    if (!has(scratch, commit)) must(scratch, "fetch", "--quiet", "origin", commit)
    rmSync(t.program, { recursive: true, force: true })
    mkdirSync(t.program, { recursive: true })
    must(scratch, `--work-tree=${t.program}`, "checkout", "--quiet", "--force", commit, "--", ".")
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

const IGNORE = ".gitignore"

/**
 * Add or remove the tracker folder's `.gitignore` line for the program, when
 * the program is inside the tracker folder. Returns the file's path, or null
 * when the program lives elsewhere and its ignoring is the project's affair.
 */
export function ignoreProgram(t: Target, ignored: boolean): string | null {
  const rel = posixRelative(t.tracker, t.program)
  if (!rel || rel.startsWith("..")) return null
  const line = `/${rel}/`
  const path = join(t.tracker, IGNORE)
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter((l) => l !== "") : []
  const kept = lines.filter((l) => l !== line)
  const next = ignored ? [...kept, line] : kept
  if (next.length) writeFileSync(path, next.join("\n") + "\n")
  else rmSync(path, { force: true })
  return path
}

/** Stage `paths` (absolute), deletions included; a path that neither exists nor is tracked is skipped. */
export function stage(root: string, ...paths: string[]): void {
  const rels = paths.map((p) => posixRelative(root, p)).filter((rel) => existsSync(join(root, rel)) || git(root, ["ls-files", "--error-unmatch", "--", rel]).ok)
  if (rels.length) must(root, "add", "--all", "--", ...rels)
}

/** Git refuses local submodule sources by default; the project chose this one. */
const allowLocal = (t: Target): string[] => (isLocalSource(t.source) ? ["-c", "protocol.file.allow=always"] : [])

/**
 * Switch how the program is carried, staging every change, so that the switch
 * is one commit. Only git writes outside the tracker folder: `.gitmodules`,
 * in submodule mode, which git itself requires. The caller records `carry`.
 */
export function carry(t: Target, to: Carry): void {
  if (t.carry === to) return
  refuseLocalWork(t)
  const rel = where(t)
  const gitmodules = join(t.root, ".gitmodules")

  // Every switch passes through a clone.
  if (t.carry === "vendored") {
    must(t.root, "rm", "-r", "-q", "--cached", "--", rel)
    rmSync(t.program, { recursive: true, force: true })
    align({ ...t, carry: "clone" })
  } else if (t.carry === "submodule") {
    must(t.root, "rm", "-q", "--cached", "--", rel)
    git(t.root, ["config", "-f", ".gitmodules", "--remove-section", `submodule.${rel}`])
    git(t.root, ["config", "--remove-section", `submodule.${rel}`])
    if (existsSync(gitmodules) && !git(t.root, ["config", "-f", ".gitmodules", "--list"]).out) must(t.root, "rm", "-q", "-f", "--", ".gitmodules")
    else if (existsSync(gitmodules)) stage(t.root, gitmodules)
  }
  const ignore = (on: boolean): void => {
    const path = ignoreProgram(t, on)
    if (path) stage(t.root, path)
  }

  if (to === "clone") ignore(true)
  if (to === "vendored") {
    rmSync(join(t.program, ".git"), { recursive: true, force: true })
    ignore(false)
    stage(t.root, t.program)
  }
  if (to === "submodule") {
    ignore(false)
    must(t.root, ...allowLocal(t), "submodule", "add", "--quiet", t.source, rel)
    stage(t.root, t.program, gitmodules)
  }
}
