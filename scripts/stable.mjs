#!/usr/bin/env node
// The bootstrap policy, as a runner: this repository is a Naima project like
// any other, pinned in `naima/config.json`, and the Naima that manages it is
// the newest tagged release inside that pin — never the working tree.
//
//   node scripts/stable.mjs <naima args...>   run the stable the pin names (npm run naima)
//   node scripts/stable.mjs --which           print the pin, the tag it resolves to, its commit and its cache
//   node scripts/stable.mjs --bump <tag>      move the pin to <tag>, after that tag passes check here
//
// The tag's `src/` and `package.json` are extracted with `git archive` into
// the user's cache directory (never into the repository) and run by node
// directly: Naima has no runtime dependencies and node runs its TypeScript as
// is. The cache directory is named by commit, so a tag that moves gets a new one.
//
// Policy: docs/bootstrap.md.

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { maxSatisfying, parseVersion } from "../src/core/semver.ts"

const CONFIG = join("naima", "config.json")
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()

function fail(message) {
  process.stderr.write(`naima stable: ${message}\n`)
  process.exit(2)
}

/** Where extracted stables live: the user's cache directory, never the project. */
export function cacheDir() {
  if (process.env.NAIMA_CACHE) return process.env.NAIMA_CACHE
  if (process.platform === "darwin") return join(homedir(), "Library", "Caches", "naima")
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "naima")
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "naima")
}

const root = (() => {
  try {
    return git(process.cwd(), "rev-parse", "--show-toplevel")
  } catch {
    return fail("not inside a git repository")
  }
})()
const configPath = join(root, CONFIG)
if (!existsSync(configPath)) fail(`no ${CONFIG} in ${root}`)
const config = JSON.parse(readFileSync(configPath, "utf8"))
const writePin = (pin) => writeFileSync(configPath, JSON.stringify({ ...config, naima: pin }, null, 2) + "\n")

const tags = () => git(root, "tag", "--list", "v*").split("\n").filter(Boolean)

/** The newest tag inside the pin, fetching tags from origin when none is here. */
function resolvePin(pin) {
  let tag = maxSatisfying(tags(), pin)
  if (!tag) {
    try {
      git(root, "fetch", "--quiet", "--tags", "origin")
    } catch {}
    tag = maxSatisfying(tags(), pin)
  }
  return tag ?? fail(`no tag here or on origin is inside the pin naima ${pin}`)
}

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
  const base = join(cacheDir(), "stable")
  const dir = join(base, `${tag}-${commit.slice(0, 12)}`)
  if (existsSync(join(dir, "src", "cli.ts"))) return { commit, dir }
  mkdirSync(base, { recursive: true })
  const tmp = mkdtempSync(join(base, ".tmp-"))
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
const pin = config.naima
if (typeof pin !== "string" || !pin) fail(`${CONFIG} has no pin (naima)`)

if (first === "--which") {
  const tag = resolvePin(pin)
  const { commit, dir } = materialise(tag)
  process.stdout.write(`${pin} ${tag} ${commit} ${dir}\n`)
  process.exit(0)
}

if (first === "--bump") {
  const tag = rest[0]
  const v = tag && parseVersion(tag)
  if (!v) fail("usage: node scripts/stable.mjs --bump <tag>, a version tag such as v0.2.0")
  const next = `^${v[0]}.${v[1]}.${v[2]}`
  process.stdout.write(`checking this repository with ${tag} before it becomes its manager\n`)
  writePin(next)
  const code = run(tag, ["check"])
  if (code !== 0) {
    writePin(pin)
    fail(`${tag} does not pass check here; the pin stays at ${pin}`)
  }
  process.stdout.write(`pinned naima ${next} (was ${pin}) — commit ${CONFIG}\n`)
  process.exit(0)
}

process.exit(run(resolvePin(pin), process.argv.slice(2)))
