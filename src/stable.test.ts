// The bootstrap runner, end to end: a repository whose tracker is managed by
// the newest tag of itself inside its pin, a bump that only happens when the
// new tag passes check, and a cache that never lands in the repository.

import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))

test("npm run naima runs the newest tag inside the pin, not the working tree; a bump is checked first", () => {
  const base = mkdtempSync(join(tmpdir(), "naima-stable-"))
  const root = join(base, "repo")
  const cache = join(base, "cache")
  mkdirSync(root)
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  const stable = (...args: string[]) => spawnSync(process.execPath, [join(root, "scripts", "stable.mjs"), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, NAIMA_CACHE: cache } })
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"))
  const version = (v: string) => writeFileSync(join(root, "package.json"), JSON.stringify({ ...pkg, version: v }, null, 2) + "\n")
  const pinOf = () => JSON.parse(readFileSync(join(root, "naima", "config.json"), "utf8")).naima
  const tag = (v: string) => {
    git("add", "-A")
    git("commit", "-q", "-m", v)
    git("tag", `v${v}`)
  }
  try {
    cpSync(join(REPO, "src"), join(root, "src"), { recursive: true })
    cpSync(join(REPO, "scripts"), join(root, "scripts"), { recursive: true })
    version("0.1.0")
    mkdirSync(join(root, "naima"))
    writeFileSync(join(root, "naima", "config.json"), JSON.stringify({ naima: "^0.1.0" }))
    git("init", "-q", "-b", "main")
    git("config", "user.email", "test@example.invalid")
    git("config", "user.name", "test")
    git("config", "commit.gpgsign", "false")
    tag("0.1.0")

    // The working tree changes the CLI; the stable does not see it.
    const cli = join(root, "src", "core", "cli.ts")
    writeFileSync(cli, readFileSync(cli, "utf8").replace("usage: naima <command> [args]", "usage: DEVELOPMENT"))
    const help = stable("help")
    assert.equal(help.status, 0, help.stderr)
    assert.match(help.stdout, /usage: naima <command>/)
    assert.doesNotMatch(help.stdout, /DEVELOPMENT/)
    assert.match(stable("--which").stdout, new RegExp(`^\\^0\\.1\\.0 v0\\.1\\.0 [0-9a-f]{40} ${cache}/stable/v0\\.1\\.0-`))
    assert.ok(!existsSync(join(root, ".naima")), "the cache is in the user's cache directory, never in the repository")
    assert.equal(git("status", "--porcelain", "--ignored"), "M src/core/cli.ts", "git trims the leading space")

    // A tag that cannot check this repository is refused, and the pin stays.
    const entry = join(root, "src", "cli.ts")
    const good = readFileSync(entry, "utf8")
    writeFileSync(entry, good.replace("process.exitCode = await", "process.exit(3); process.exitCode = await"))
    version("0.2.0")
    tag("0.2.0")
    assert.notEqual(stable("--bump", "v0.2.0").status, 0)
    assert.equal(pinOf(), "^0.1.0")
    assert.match(stable("help").stdout, /usage: naima <command>/, "still the 0.1.0 stable")

    writeFileSync(entry, good)
    version("0.2.1")
    tag("0.2.1")
    const bump = stable("--bump", "v0.2.1")
    assert.equal(bump.status, 0, bump.stderr)
    assert.equal(pinOf(), "^0.2.1")
    assert.match(stable("help").stdout, /DEVELOPMENT/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
