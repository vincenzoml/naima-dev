// End to end, as a user would: a git repository somewhere on disk, Naima
// somewhere else, the CLI run from Naima's location.

import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { firstParty } from "./builtins.ts"
import { runCli } from "./core/index.ts"

const NAIMA = dirname(dirname(fileURLToPath(import.meta.url)))
const CLI = join(NAIMA, "src", "cli.ts")
const VERSION = (JSON.parse(readFileSync(join(NAIMA, "package.json"), "utf8")) as { version: string }).version

/** A git repository outside Naima, with one commit, and a cache directory of its own. */
function host() {
  const base = mkdtempSync(join(tmpdir(), "naima-host-"))
  const root = join(base, "project")
  const cache = join(base, "cache")
  mkdirSync(root)
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  git("init", "-q", "-b", "main")
  git("config", "user.email", "test@example.invalid")
  git("config", "user.name", "test")
  git("config", "commit.gpgsign", "false")
  writeFileSync(join(root, "README.md"), "# A project that is not Naima\n")
  mkdirSync(join(root, "src"))
  writeFileSync(join(root, "src", "main.py"), "print('hello')\n")
  git("add", "-A")
  git("commit", "-q", "-m", "init")
  const naima = (cwd: string, ...args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: { ...process.env, NAIMA_CACHE: cache, XDG_CACHE_HOME: cache } })
  return { base, root, cache, git, naima, cleanup: () => rmSync(base, { recursive: true, force: true }) }
}

test("just add naima: init, new, check in a repository outside Naima; the only addition is naima/", () => {
  const h = host()
  try {
    const init = h.naima(h.root, "init")
    assert.equal(init.status, 0, init.stderr)
    assert.match(init.stdout, /next: naima new/)
    assert.deepEqual(JSON.parse(readFileSync(join(h.root, "naima", "config.json"), "utf8")), { naima: `^${VERSION}` })

    // from a subdirectory: root detection walks up to naima/config.json
    const sub = join(h.root, "src")
    const made = h.naima(sub, "new", "bugs", "Export drops alpha", "--set", "impact=high")
    assert.equal(made.status, 0, made.stderr)
    assert.match(made.stdout, /^naima\/bugs\/export-drops-alpha\//)
    const check = h.naima(sub, "check")
    assert.equal(check.status, 0, check.stdout + check.stderr)

    // the host's footprint: git sees one new directory and nothing else
    assert.equal(h.git("status", "--porcelain", "--untracked-files=normal"), "?? naima/")
    assert.equal(h.git("status", "--porcelain", "--ignored"), "?? naima/", "nothing ignored was written either: no cache, no node_modules")
    assert.deepEqual(readdirSync(join(h.root, "naima")).sort(), ["bugs", "config.json"])
    assert.equal(readFileSync(join(h.root, "README.md"), "utf8"), "# A project that is not Naima\n", "no user file is touched")

    // init again changes nothing
    assert.equal(h.naima(h.root, "init").status, 0)
    assert.equal(h.git("status", "--porcelain"), "?? naima/")
  } finally {
    h.cleanup()
  }
})

test("a naima outside the pin refuses, in one line naming the version to use", () => {
  const h = host()
  try {
    mkdirSync(join(h.root, "naima"))
    writeFileSync(join(h.root, "naima", "config.json"), JSON.stringify({ naima: "^9.1.0" }))
    const r = h.naima(h.root, "check")
    assert.equal(r.status, 2)
    assert.equal(r.stdout, "")
    const lines = r.stderr.trimEnd().split("\n")
    assert.equal(lines.length, 1, r.stderr)
    assert.equal(lines[0], `naima: naima ${VERSION} does not manage this project: naima/config.json pins naima ^9.1.0 — run npx naima@"^9.1.0"`)
    assert.equal(h.naima(h.root, "new", "bugs", "x").status, 2)
    assert.equal(h.git("status", "--porcelain"), "?? naima/", "a refusal writes nothing")
  } finally {
    h.cleanup()
  }
})

test("init refuses outside a git repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "naima-nogit-"))
  try {
    const r = spawnSync(process.execPath, [CLI, "init"], { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) } })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /not a git repository/)
    assert.deepEqual(readdirSync(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function naima(cwd: string, ...argv: string[]) {
  const out: string[] = []
  const err: string[] = []
  const code = await runCli(argv, { cwd, version: VERSION, firstParty, io: { out: (l = "") => void out.push(l), err: (l) => void err.push(l), now: () => new Date("2026-01-15T10:00:00Z") } })
  return { code, out: out.join("\n"), err: err.join("\n") }
}

test("every first-party plugin is loaded with nothing but the pin; link, show, board", async () => {
  const h = host()
  try {
    assert.equal((await naima(h.root, "init")).code, 0)
    const plugins = (await naima(h.root, "plugins")).out
    for (const p of firstParty({ gates: {} })) assert.match(plugins, new RegExp(`\\b${p.name}\\b`))
    assert.equal((await naima(h.root, "new", "bugs", "Export drops alpha", "--set", "impact=high")).code, 0)
    assert.equal((await naima(h.root, "new", "tests", "Export keeps alpha")).code, 0)
    assert.equal((await naima(h.root, "link", "export-keeps-alpha", "verifies", "export-drops-alpha")).code, 0)
    const shown = await naima(h.root, "show", "export-drops-alpha")
    assert.match(shown.out, /is proven by tests\/export-keeps-alpha \[open\]  \(inverse\)/)
    assert.match(shown.out, /impact: high/)
    const check = await naima(h.root, "check")
    assert.equal(check.code, 0, check.out)
    assert.match((await naima(h.root, "board", "bugs")).out, /1 open, 0 done/)
    assert.match((await naima(h.root, "unknown")).err, /unknown command/)
    assert.equal((await naima(h.root, "new", "bugs", "x", "--set", "impact=huge")).code, 2)
  } finally {
    h.cleanup()
  }
})

test("a third-party plugin is added from a path; a first-party name there is refused", async () => {
  const h = host()
  try {
    writeFileSync(
      join(h.root, "hello.mjs"),
      `export default (o) => ({ name: "hello", says: "demo", commands: [{ name: "hello", says: "", usage: "hello", run: (_a, ctx) => { ctx.out("hello " + o.who); return 0 } }] })\n`,
    )
    mkdirSync(join(h.root, "naima"))
    writeFileSync(join(h.root, "naima", "config.json"), JSON.stringify({ naima: `^${VERSION}`, plugins: [{ name: "./hello.mjs", options: { who: "world" } }] }))
    assert.equal((await naima(h.root, "hello")).out, "hello world")
    writeFileSync(join(h.root, "naima", "config.json"), JSON.stringify({ naima: `^${VERSION}`, plugins: ["trackers"] }))
    assert.match((await naima(h.root, "check")).err, /"trackers" is first-party and always loaded/)
  } finally {
    h.cleanup()
  }
})
