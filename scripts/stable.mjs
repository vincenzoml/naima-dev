#!/usr/bin/env node
// The bootstrap policy, as a runner: this repository's tracker is managed by
// the previous stable Naima, pinned by git tag, never by the working tree.
//
//   node scripts/stable.mjs <naima args...>   run the pinned stable (npm run naima)
//   node scripts/stable.mjs --which           print the pin, its commit and its cache
//   node scripts/stable.mjs --bump <tag>      move the pin, after the new stable passes check
//
// The pin is `naimaStable` in package.json. The tag's `src/` and
// `package.json` are extracted with `git archive` into `.naima/stable/<tag>-<commit>/`
// (ignored by git) and run by node directly: Naima has no runtime dependencies
// and node runs its TypeScript as is. A tag that moves gets a new cache
// directory, because the directory is named by the commit.
//
// Policy: docs/bootstrap.md.

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()

function fail(message) {
  process.stderr.write(`naima stable: ${message}\n`)
  process.exit(2)
}

const root = (() => {
  try {
    return git(process.cwd(), "rev-parse", "--show-toplevel")
  } catch {
    return fail("not inside a git repository")
  }
})()
const pkgPath = join(root, "package.json")
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))

function commitOf(tag) {
  try {
    return git(root, "rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`)
  } catch {
    try {
      git(root, "fetch", "--quiet", "origin", "tag", tag, "--no-tags")
      return git(root, "rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`)
    } catch {
      return fail(`tag ${tag} is neither here nor on origin`)
    }
  }
}

/** Extract the tag once; return the directory holding its cli. */
function materialise(tag) {
  const commit = commitOf(tag)
  const dir = join(root, ".naima", "stable", `${tag}-${commit.slice(0, 12)}`)
  if (existsSync(join(dir, "src", "cli.ts"))) return { commit, dir }
  mkdirSync(join(root, ".naima", "stable"), { recursive: true })
  const tmp = mkdtempSync(join(root, ".naima", "stable", ".tmp-"))
  const archive = spawnSync("git", ["archive", "--format=tar", commit, "src", "package.json"], { cwd: root, maxBuffer: 1 << 30 })
  if (archive.status !== 0) fail(`git archive ${tag} failed: ${archive.stderr}`)
  const untar = spawnSync("tar", ["-x", "-C", tmp], { input: archive.stdout })
  if (untar.status !== 0) fail(`extracting ${tag} failed: ${untar.stderr}`)
  rmSync(dir, { recursive: true, force: true })
  renameSync(tmp, dir)
  return { commit, dir }
}

function run(tag, args) {
  const { dir } = materialise(tag)
  const r = spawnSync(process.execPath, [join(dir, "src", "cli.ts"), ...args], { cwd: process.cwd(), stdio: "inherit" })
  return r.status ?? 2
}

const [first, ...rest] = process.argv.slice(2)
const pinned = pkg.naimaStable
if (typeof pinned !== "string" || !pinned) fail("package.json has no naimaStable pin")

if (first === "--which") {
  const { commit, dir } = materialise(pinned)
  process.stdout.write(`${pinned} ${commit} ${dir.slice(root.length + 1)}\n`)
  process.exit(0)
}

if (first === "--bump") {
  const tag = rest[0]
  if (!tag) fail("usage: node scripts/stable.mjs --bump <tag>")
  process.stdout.write(`checking the tracker with ${tag} before it becomes its manager\n`)
  const code = run(tag, ["check"])
  if (code !== 0) fail(`${tag} does not pass check on this tracker; the pin stays at ${pinned}`)
  pkg.naimaStable = tag
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
  process.stdout.write(`pinned ${tag} (was ${pinned}) — commit package.json\n`)
  process.exit(0)
}

process.exit(run(pinned, process.argv.slice(2)))
