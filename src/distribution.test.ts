// The distribution, end to end, under Deno and through the launcher, whatever
// runtime runs this file: a Naima source repository, a host project that
// clones it into naima-tracker/naima/, and every way the program is aligned,
// updated, carried and fenced in. docs/install.md and docs/format.md describe
// what is asserted here.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { FORMAT, TRACKER_README } from "./core/index.ts"
import { gitIn as git, removeTemp } from "./core/testing.ts"

const NAIMA = dirname(dirname(fileURLToPath(import.meta.url)))

if (spawnSync("deno", ["--version"]).status !== 0) throw new Error("deno is not on PATH: these tests run Naima through its launcher, under Deno")


/** A world on disk: Naima's source as a git repository, and a host project. */
function world() {
  const base = mkdtempSync(join(tmpdir(), "naima-dist-"))
  const source = join(base, "naima")
  mkdirSync(source)
  cpSync(join(NAIMA, "src"), join(source, "src"), { recursive: true })
  cpSync(join(NAIMA, "naima.ts"), join(source, "naima.ts"))
  git(source, "init", "-q", "-b", "main")
  git(source, "add", "-A")
  git(source, "commit", "-q", "-m", "Naima")
  const host = join(base, "project")
  mkdirSync(join(host, "src"), { recursive: true })
  writeFileSync(join(host, "README.md"), "# A project that is not Naima\n")
  git(host, "init", "-q", "-b", "main")
  git(host, "add", "-A")
  git(host, "commit", "-q", "-m", "init")
  return {
    base,
    source,
    host,
    head: (repo = source) => git(repo, "rev-parse", "HEAD"),
    /** A new commit on the source's main, changing `file` by `edit`. */
    advance(file = "src/marker.txt", edit: (text: string) => string = (t) => t + "moved\n") {
      const path = join(source, file)
      writeFileSync(path, edit(existsSync(path) ? readFileSync(path, "utf8") : ""))
      git(source, "add", "-A")
      git(source, "commit", "-q", "-m", `change ${file}`)
      return git(source, "rev-parse", "HEAD")
    },
    cleanup: () => removeTemp(base),
  }
}

/** Naima through a launcher: any Naima's, run from inside the project. */
function launch(launcher: string, cwd: string, ...args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1", NAIMA_DATA: undefined, NAIMA_LAUNCHED: undefined }
  const r = spawnSync("deno", ["run", "-A", launcher, ...args], { cwd, encoding: "utf8", env })
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() }
}

/** Naima as a person or an agent runs it: the project's own launcher. */
const naima = (cwd: string, ...args: string[]) => launch(join(git(cwd, "rev-parse", "--show-toplevel"), "naima-tracker", "naima", "naima.ts"), cwd, ...args)

/** The bootstrap an agent performs: clone Naima into naima-tracker/naima/, then init, then commit. */
function bootstrap(w: ReturnType<typeof world>) {
  git(w.host, "clone", "-q", w.source, "naima-tracker/naima")
  const init = naima(w.host, "init")
  assert.equal(init.code, 0, init.err)
  return init
}

const lockOf = (host: string) => JSON.parse(readFileSync(join(host, "naima-tracker", "naima-data", "naima.json"), "utf8"))
const setLock = (host: string, patch: Record<string, unknown>) =>
  writeFileSync(join(host, "naima-tracker", "naima-data", "naima.json"), JSON.stringify({ ...lockOf(host), ...patch }, null, 2) + "\n")
const programOf = (host: string) => join(host, "naima-tracker", "naima")

test("bootstrap, init, new, check: the only addition is naima-tracker/, and git sees naima-data/, README.md and .gitignore but not naima/", () => {
  const w = world()
  try {
    bootstrap(w)
    assert.deepEqual(lockOf(w.host), { format: FORMAT, source: w.source, commit: w.head(), carry: "clone" })
    assert.equal(readFileSync(join(w.host, "naima-tracker", "README.md"), "utf8"), TRACKER_README)
    const made = naima(join(w.host, "src"), "new", "bugs", "Export drops alpha")
    assert.equal(made.code, 0, made.err)
    const check = naima(join(w.host, "src"), "check")
    assert.equal(check.code, 0, check.out + check.err)
    assert.equal(
      git(w.host, "status", "--porcelain", "--untracked-files=all"),
      [
        "?? naima-tracker/.gitignore",
        "?? naima-tracker/README.md",
        "?? naima-tracker/naima-data/bugs/export-drops-alpha/README.md",
        "?? naima-tracker/naima-data/bugs/export-drops-alpha/attachments/.gitkeep",
        "?? naima-tracker/naima-data/bugs/export-drops-alpha/meta.json",
        "?? naima-tracker/naima-data/naima.json",
      ].join("\n"),
    )
    assert.match(git(w.host, "status", "--porcelain", "--ignored"), /^!! naima-tracker\/naima\/$/m)
    assert.equal(readFileSync(join(w.host, "README.md"), "utf8"), "# A project that is not Naima\n", "no project file is touched")
  } finally {
    w.cleanup()
  }
})

test("a second clone of the host aligns naima-tracker/naima/ to the recorded source and commit; a new worktree clones it from the local one", () => {
  const w = world()
  try {
    bootstrap(w)
    const locked = w.head()
    git(w.host, "add", "-A")
    git(w.host, "commit", "-q", "-m", "Track with Naima")
    w.advance() // the source's main is no longer the lock

    const second = join(w.base, "second")
    git(w.base, "clone", "-q", w.host, second)
    assert.ok(!existsSync(programOf(second)), "the program is not in the host's history")
    git(second, "clone", "-q", w.source, "naima-tracker/naima") // the bootstrap: the source's main, which is not the lock
    const r = naima(second, "check")
    assert.equal(r.code, 0, r.err)
    assert.equal(git(programOf(second), "rev-parse", "HEAD"), locked)
    assert.equal(git(programOf(second), "remote", "get-url", "origin"), w.source)

    renameSync(w.source, `${w.source}.gone`) // no source: the clone must come from this disk
    const tree = join(w.base, "worktree")
    git(w.host, "worktree", "add", "-q", tree)
    const inTree = launch(join(programOf(w.host), "naima.ts"), tree, "check") // any Naima at hand aligns this checkout's own
    assert.ok(existsSync(programOf(tree)))
    assert.equal(inTree.code, 0, inTree.err)
    assert.equal(git(programOf(tree), "rev-parse", "HEAD"), locked)
    assert.equal(git(programOf(tree), "remote", "get-url", "origin"), w.source, "the source stays the recorded one")
  } finally {
    w.cleanup()
  }
})

test("naima update pulls, migrates and records the new commit; a normal run never pulls", () => {
  const w = world()
  try {
    bootstrap(w)
    const old = w.head()
    assert.equal(naima(w.host, "new", "todos", "Written in format 1").code, 0)
    // The source's main gains a migration: format 1 → 2 stamps every item.
    const moved = w.advance("src/core/format.ts", (t) =>
      t.replace(
        "export const MIGRATIONS: readonly Migration[] = []",
        'export const MIGRATIONS: readonly Migration[] = [{ from: 1, says: "stamped", item: (m) => ({ ...m, stamped: true }), stale: (m) => m.stamped !== true }]',
      ),
    )

    const check = naima(w.host, "check")
    assert.equal(check.code, 0, check.err)
    assert.equal(git(programOf(w.host), "rev-parse", "HEAD"), old, "a normal run keeps the lock")
    assert.equal(git(programOf(w.host), "rev-parse", "refs/remotes/origin/main"), old, "and fetched nothing")
    assert.equal(lockOf(w.host).commit, old)

    const asked = naima(w.host, "update", "--check")
    assert.equal(asked.code, 1)
    assert.match(asked.out, /the source's main moved/)

    const up = naima(w.host, "update")
    assert.equal(up.code, 0, up.err)
    assert.match(up.out, new RegExp(`locked ${old.slice(0, 12)} → ${moved.slice(0, 12)}`))
    assert.match(up.out, /migrated the data from format 1 to 2/)
    assert.deepEqual({ format: lockOf(w.host).format, commit: lockOf(w.host).commit }, { format: 2, commit: moved })
    assert.equal(git(programOf(w.host), "rev-parse", "HEAD"), moved)
    const meta = JSON.parse(readFileSync(join(w.host, "naima-tracker", "naima-data", "todos", "written-format-1", "meta.json"), "utf8"))
    assert.equal(meta.stamped, true)
    assert.equal(naima(w.host, "check").code, 0)
    assert.equal(naima(w.host, "update", "--check").code, 0)
    assert.match(naima(w.host, "update").out, /nothing to migrate/, "again: a no-op")
  } finally {
    w.cleanup()
  }
})

test("alignment refuses rather than destroy or guess: local changes, an unreachable commit, no network on the first run", () => {
  const w = world()
  try {
    bootstrap(w)
    writeFileSync(join(programOf(w.host), "src", "marker.txt"), "my change\n")
    const dirty = naima(w.host, "check")
    assert.equal(dirty.code, 2)
    assert.equal(dirty.err, "naima: naima-tracker/naima has uncommitted changes — publish them as a fork and set source in naima.json; Naima never overwrites them")
    assert.equal(readFileSync(join(programOf(w.host), "src", "marker.txt"), "utf8"), "my change\n")
    rmSync(join(programOf(w.host), "src", "marker.txt"))

    setLock(w.host, { commit: "0123456789abcdef0123456789abcdef01234567" })
    const lost = naima(w.host, "check")
    assert.equal(lost.code, 2)
    assert.equal(lost.err, `naima: commit 0123456789ab cannot be fetched from ${w.source} — its history was rewritten or the source is gone; record a commit it has`)

    setLock(w.host, { commit: w.head(), source: join(w.base, "nowhere") })
    rmSync(programOf(w.host), { recursive: true, force: true })
    const offline = launch(join(NAIMA, "naima.ts"), w.host, "check")
    assert.equal(offline.code, 2)
    assert.equal(offline.err.split("\n").length, 1, offline.err)
    assert.match(offline.err, /^naima: cannot clone .*nowhere into naima-tracker\/naima: .* — the first run needs git and the network$/)
  } finally {
    w.cleanup()
  }
})

/** A fork of Naima with a plugin that tries to reach outside the tracker folder. */
function fork(w: ReturnType<typeof world>) {
  const dir = join(w.base, "fork")
  git(w.base, "clone", "-q", w.source, dir)
  mkdirSync(join(dir, "plugins"))
  writeFileSync(
    join(dir, "plugins", "escape.ts"),
    `import { writeFileSync } from "node:fs"
import { join } from "node:path"
const command = (name: string, run: (ctx: { root: string; trackerRoot: string; out(l: string): void }) => void) => ({ name, says: name, usage: name, examples: [name], run: (_a: string[], ctx: any) => (run(ctx), 0) })
export default () => ({
  name: "escape",
  says: "tries to reach outside",
  commands: [
    command("fork-says", (ctx) => ctx.out("this is the fork")),
    command("write-inside", (ctx) => writeFileSync(join(ctx.trackerRoot, "inside.txt"), "ok")),
    command("write-outside", (ctx) => writeFileSync(join(ctx.root, "escaped.txt"), "no")),
    command("run-other", () => { new Deno.Command("ls").outputSync() }),
  ],
})
`,
  )
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", "A fork with a plugin")
  return { dir, commit: git(dir, "rev-parse", "HEAD") }
}

test("a fork source is honoured: the whole project runs that fork at that commit", () => {
  const w = world()
  try {
    bootstrap(w)
    const f = fork(w)
    setLock(w.host, { source: f.dir, commit: f.commit, plugins: ["plugins/escape.ts"] })
    const r = naima(w.host, "fork-says")
    assert.equal(r.code, 0, r.err)
    assert.equal(r.out, "this is the fork")
    assert.equal(git(programOf(w.host), "rev-parse", "HEAD"), f.commit)
    assert.equal(git(programOf(w.host), "remote", "get-url", "origin"), f.dir)
  } finally {
    w.cleanup()
  }
})

test("under the launcher's permissions Naima writes only under naima-tracker/ and runs only git: Deno refuses the rest", () => {
  const w = world()
  try {
    bootstrap(w)
    const f = fork(w)
    setLock(w.host, { source: f.dir, commit: f.commit, plugins: ["plugins/escape.ts"] })
    assert.equal(naima(w.host, "write-inside").code, 0)
    assert.ok(existsSync(join(w.host, "naima-tracker", "naima-data", "inside.txt")))
    const write = naima(w.host, "write-outside")
    assert.equal(write.code, 2)
    assert.match(write.err, /^naima: Requires write access to ".*project\/escaped\.txt", run again with the --allow-write flag$/)
    assert.ok(!existsSync(join(w.host, "escaped.txt")))
    const run = naima(w.host, "run-other")
    assert.equal(run.code, 2)
    assert.equal(run.err, 'naima: Requires run access to "ls", run again with the --allow-run flag')
  } finally {
    w.cleanup()
  }
})

test("naima carry round-trips clone → vendored → submodule → clone, the checks passing and the same commit running in each mode", () => {
  const w = world()
  try {
    bootstrap(w)
    const locked = w.head()
    git(w.host, "add", "-A")
    git(w.host, "commit", "-q", "-m", "Track with Naima")
    const cli = readFileSync(join(programOf(w.host), "src", "cli.ts"), "utf8")
    const step = (mode: string) => {
      const r = naima(w.host, "carry", mode)
      assert.equal(r.code, 0, r.err)
      assert.match(r.out, new RegExp(`carried as ${mode}.*staged`))
      git(w.host, "commit", "-q", "-m", `Carry Naima as ${mode}`)
      assert.equal(git(w.host, "status", "--porcelain"), "", `${mode}: the switch is one commit`)
      const check = naima(w.host, "check")
      assert.equal(check.code, 0, `${mode}: ${check.out}${check.err}`)
      assert.equal(lockOf(w.host).carry, mode)
      assert.equal(lockOf(w.host).commit, locked)
      assert.equal(readFileSync(join(programOf(w.host), "src", "cli.ts"), "utf8"), cli, `${mode}: the locked commit's code`)
    }

    step("vendored")
    assert.ok(!existsSync(join(programOf(w.host), ".git")))
    assert.ok(git(w.host, "ls-files", "naima-tracker/naima/naima.ts"), "the program is committed")
    assert.ok(!existsSync(join(w.host, "naima-tracker", ".gitignore")))

    step("submodule")
    assert.match(git(w.host, "ls-files", "--stage", "naima-tracker/naima"), new RegExp(`^160000 ${locked} 0\\tnaima-tracker/naima$`))
    assert.match(readFileSync(join(w.host, ".gitmodules"), "utf8"), /path = naima-tracker\/naima/)
    assert.equal(git(programOf(w.host), "rev-parse", "HEAD"), locked)

    step("clone")
    assert.equal(git(w.host, "ls-files", "naima-tracker/naima"), "")
    assert.ok(!existsSync(join(w.host, ".gitmodules")))
    assert.equal(readFileSync(join(w.host, "naima-tracker", ".gitignore"), "utf8"), "/naima/\n")
    assert.equal(git(programOf(w.host), "rev-parse", "HEAD"), locked)
  } finally {
    w.cleanup()
  }
})
