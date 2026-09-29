// The bootstrap runner, end to end: a repository whose tracker is managed by
// a pinned tag of itself, and a bump that only happens when the new tag
// passes check on that tracker.

import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))

test("npm run naima runs the pinned tag, not the working tree; a bump is checked first", () => {
  const root = mkdtempSync(join(tmpdir(), "naima-stable-"))
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  const stable = (...args: string[]) => spawnSync(process.execPath, [join(root, "scripts", "stable.mjs"), ...args], { cwd: root, encoding: "utf8" })
  try {
    cpSync(join(REPO, "src"), join(root, "src"), { recursive: true })
    cpSync(join(REPO, "scripts"), join(root, "scripts"), { recursive: true })
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"))
    writeFileSync(join(root, "package.json"), JSON.stringify({ ...pkg, naimaStable: "v1" }, null, 2) + "\n")
    writeFileSync(join(root, ".gitignore"), ".naima/\n")
    writeFileSync(join(root, "naima.config.json"), JSON.stringify({ trackerDir: "tracker", plugins: ["trackers"] }))
    git("init", "-q", "-b", "main")
    git("config", "user.email", "test@example.invalid")
    git("config", "user.name", "test")
    git("config", "commit.gpgsign", "false")
    git("add", "-A")
    git("commit", "-q", "-m", "v1")
    git("tag", "v1")

    // The working tree changes the CLI; the stable does not see it.
    const cli = join(root, "src", "core", "cli.ts")
    writeFileSync(cli, readFileSync(cli, "utf8").replace("usage: naima <command> [args]", "usage: DEVELOPMENT"))
    const help = stable("help")
    assert.equal(help.status, 0, help.stderr)
    assert.match(help.stdout, /usage: naima <command>/)
    assert.doesNotMatch(help.stdout, /DEVELOPMENT/)
    assert.match(stable("--which").stdout, /^v1 [0-9a-f]{40} \.naima\/stable\/v1-/)

    // A tag whose Naima cannot read this tracker is refused, and the pin stays.
    git("add", "-A")
    git("commit", "-q", "-m", "dev")
    git("tag", "v2")
    writeFileSync(join(root, "naima.config.json"), JSON.stringify({ trackerDir: "tracker", plugins: ["trackers", "no-such-plugin"] }))
    assert.notEqual(stable("--bump", "v2").status, 0)
    assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).naimaStable, "v1")

    writeFileSync(join(root, "naima.config.json"), JSON.stringify({ trackerDir: "tracker", plugins: ["trackers"] }))
    const bump = stable("--bump", "v2")
    assert.equal(bump.status, 0, bump.stderr)
    assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).naimaStable, "v2")
    assert.match(stable("help").stdout, /DEVELOPMENT/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
