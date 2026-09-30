// The entry point, in process, on every runtime: a git repository somewhere
// on disk, Naima's CLI run against it as the development build runs, without
// the launcher. What only the launcher does — aligning the program, updating,
// carrying, and the permissions — is in distribution.test.ts.

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { firstParty } from "./builtins.ts"
import { ABOUT, FORMAT, TRACKER_README, runCli } from "./core/index.ts"

const NAIMA = dirname(dirname(fileURLToPath(import.meta.url)))

/** A git repository outside Naima, with one commit. */
function host() {
  const base = mkdtempSync(join(tmpdir(), "naima-host-"))
  const root = join(base, "project")
  mkdirSync(join(root, "src"), { recursive: true })
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  git("init", "-q", "-b", "main")
  writeFileSync(join(root, "README.md"), "# A project that is not Naima\n")
  writeFileSync(join(root, "src", "main.py"), "print('hello')\n")
  git("add", "-A")
  git("-c", "user.email=test@example.invalid", "-c", "user.name=test", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "init")
  return { base, root, git, cleanup: () => rmSync(base, { recursive: true, force: true }) }
}

async function naima(cwd: string, argv: string[], programRoot = NAIMA) {
  const out: string[] = []
  const err: string[] = []
  const io = { out: (l = "") => void out.push(l), err: (l: string) => void err.push(l), now: () => new Date("2026-01-15T10:00:00Z") }
  const code = await runCli(argv, { cwd, programRoot, firstParty, io })
  return { code, out: out.join("\n"), err: err.join("\n") }
}

test("init writes naima-tracker/ and nothing else, locked to the Naima that runs it; again, it changes nothing", async () => {
  const h = host()
  try {
    const init = await naima(h.root, ["init"])
    assert.equal(init.code, 0, init.err)
    assert.match(init.out, /next: naima new/)
    const data = JSON.parse(readFileSync(join(h.root, "naima-tracker", "naima-data", "naima.json"), "utf8"))
    const git = (...args: string[]) => execFileSync("git", ["-C", NAIMA, ...args], { encoding: "utf8" }).trim()
    assert.deepEqual(data, { format: FORMAT, source: git("remote", "get-url", "origin"), commit: git("rev-parse", "HEAD"), carry: "clone" })
    assert.equal(readFileSync(join(h.root, "naima-tracker", "README.md"), "utf8"), TRACKER_README)
    assert.equal(readFileSync(join(h.root, "naima-tracker", ".gitignore"), "utf8"), "/naima/\n")
    assert.equal(h.git("status", "--porcelain", "--untracked-files=all"), ["?? naima-tracker/.gitignore", "?? naima-tracker/README.md", "?? naima-tracker/naima-data/naima.json"].join("\n"))
    assert.equal((await naima(h.root, ["init"])).code, 0)
    assert.equal(h.git("status", "--porcelain", "--untracked-files=all").split("\n").length, 3)
  } finally {
    h.cleanup()
  }
})

test("the tracker's README and Naima's own share one sentence", () => {
  assert.ok(readFileSync(join(NAIMA, "README.md"), "utf8").includes(`Naima ${ABOUT}`))
  assert.equal(TRACKER_README.split("\n").length, 2, "one line")
})

test("init refuses outside a git repository", async () => {
  const dir = mkdtempSync(join(tmpdir(), "naima-nogit-"))
  try {
    const r = await naima(dir, ["init"])
    assert.equal(r.code, 2)
    assert.match(r.err, /not a git repository/)
    assert.deepEqual(readdirSync(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("every first-party plugin is loaded with nothing but the lock; new, link, show, board, from a subdirectory", async () => {
  const h = host()
  try {
    assert.equal((await naima(h.root, ["init"])).code, 0)
    const sub = join(h.root, "src")
    const plugins = (await naima(sub, ["plugins"])).out
    for (const p of firstParty({ gates: {} })) assert.match(plugins, new RegExp(`\\b${p.name}\\b`))
    const made = await naima(sub, ["new", "bugs", "Export drops alpha", "--set", "impact=high"])
    assert.match(made.out, /^naima-tracker\/naima-data\/bugs\/export-drops-alpha\//)
    assert.equal((await naima(sub, ["new", "tests", "Export keeps alpha"])).code, 0)
    assert.equal((await naima(sub, ["link", "export-keeps-alpha", "verifies", "export-drops-alpha"])).code, 0)
    const shown = await naima(sub, ["show", "export-drops-alpha"])
    assert.match(shown.out, /is proven by tests\/export-keeps-alpha \[open\]  \(inverse\)/)
    const check = await naima(sub, ["check"])
    assert.equal(check.code, 0, check.out)
    assert.match((await naima(sub, ["board", "bugs"])).out, /1 open, 0 done/)
    assert.match((await naima(sub, ["unknown"])).err, /unknown command/)
    assert.equal((await naima(sub, ["new", "bugs", "x", "--set", "impact=huge"])).code, 2)
  } finally {
    h.cleanup()
  }
})

test("--data names a data directory that has moved", async () => {
  const h = host()
  try {
    assert.equal((await naima(h.root, ["init"])).code, 0)
    renameSync(join(h.root, "naima-tracker", "naima-data"), join(h.root, "tracking"))
    assert.equal((await naima(h.root, ["check"])).code, 2, "no naima-tracker/naima-data/ any more")
    const r = await naima(h.root, ["--data", "tracking", "new", "todos", "Moved"])
    assert.equal(r.code, 0, r.err)
    assert.match(r.out, /^tracking\/todos\/moved\//)
  } finally {
    h.cleanup()
  }
})

test("newer data is refused in one line, and nothing is written", async () => {
  const h = host()
  try {
    assert.equal((await naima(h.root, ["init"])).code, 0)
    const file = join(h.root, "naima-tracker", "naima-data", "naima.json")
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), format: FORMAT + 1 }))
    const r = await naima(h.root, ["new", "bugs", "x"])
    assert.equal(r.code, 2)
    assert.equal(r.out, "")
    assert.equal(r.err, `naima: naima.json is format ${FORMAT + 1}, newer than the format ${FORMAT} this Naima reads — it was written by a newer Naima: record that Naima's commit`)
    assert.ok(!existsSync(join(h.root, "naima-tracker", "naima-data", "bugs")))
  } finally {
    h.cleanup()
  }
})

test("a third-party plugin runs only from inside the program; a first-party name is refused", async () => {
  const h = host()
  try {
    assert.equal((await naima(h.root, ["init"])).code, 0)
    const program = join(h.base, "fork")
    mkdirSync(join(program, "plugins"), { recursive: true })
    const plugin = `export default (o) => ({ name: "hello", says: "demo", commands: [{ name: "hello", says: "", usage: "hello", run: (_a, ctx) => { ctx.out("hello " + o.who); return 0 } }] })\n`
    writeFileSync(join(program, "plugins", "hello.mjs"), plugin)
    writeFileSync(join(h.root, "hello.mjs"), plugin)
    const file = join(h.root, "naima-tracker", "naima-data", "naima.json")
    const lock = JSON.parse(readFileSync(file, "utf8"))
    const plugins = (list: unknown[]) => writeFileSync(file, JSON.stringify({ ...lock, plugins: list }))
    plugins([{ name: "plugins/hello.mjs", options: { who: "world" } }])
    assert.equal((await naima(h.root, ["hello"], program)).out, "hello world")
    plugins(["../project/hello.mjs"])
    assert.match((await naima(h.root, ["hello"], program)).err, /not a path inside the program/)
    plugins(["trackers"])
    assert.match((await naima(h.root, ["check"], program)).err, /"trackers" is first-party and always loaded/)
  } finally {
    h.cleanup()
  }
})

test("update and carry move the program, so they run only through the launcher; guide points at files that exist", async () => {
  const h = host()
  try {
    assert.equal((await naima(h.root, ["init"])).code, 0)
    for (const command of ["update", "carry"]) assert.match((await naima(h.root, [command])).err, /runs through the launcher/)
    const guide = await naima(NAIMA, ["guide"])
    assert.equal(guide.code, 0)
    const paths = [...guide.out.matchAll(/^ {2}\S+\s+(\S+)$/gm)].map((m) => m[1] as string)
    assert.equal(paths.length, 6)
    for (const p of paths) assert.ok(existsSync(join(NAIMA, p)), p)
  } finally {
    h.cleanup()
  }
})

test("the reference is the program's: a project's own gates do not change it", async () => {
  const h = host()
  try {
    assert.equal((await naima(h.root, ["init"])).code, 0)
    const before = await naima(h.root, ["docs"])
    const file = join(h.root, "naima-tracker", "naima-data", "naima.json")
    const lock = JSON.parse(readFileSync(file, "utf8"))
    writeFileSync(file, JSON.stringify({ ...lock, gates: { "v1-launch": { title: "The launch", says: "what ships first" } } }))
    const after = await naima(h.root, ["docs"])
    assert.equal(after.code, 0, after.err)
    assert.equal(after.out, before.out)
    assert.doesNotMatch(after.out, /v1-launch|The launch/)
    assert.match((await naima(h.root, ["gates"])).out, /v1-launch — The launch: HOLDS/)
  } finally {
    h.cleanup()
  }
})
