// End to end through the composition root: init, open, link, check, from a
// config file on disk, as a user would.

import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { builtins, defaultPlugins } from "./builtins.ts"
import { runCli } from "./core/index.ts"

async function naima(cwd: string, ...argv: string[]) {
  const out: string[] = []
  const err: string[] = []
  const code = await runCli(argv, { cwd, builtins, defaultPlugins, io: { out: (l = "") => void out.push(l), err: (l) => void err.push(l), now: () => new Date("2026-01-15T10:00:00Z") } })
  return { code, out: out.join("\n"), err: err.join("\n") }
}

test("init, new, link, check, board — from a config file", async () => {
  const root = mkdtempSync(join(tmpdir(), "naima-cli-"))
  try {
    assert.equal((await naima(root, "check")).code, 2)
    assert.equal((await naima(root, "init")).code, 0)
    assert.equal((await naima(root, "init")).code, 2, "init refuses to overwrite")
    assert.equal((await naima(root, "new", "bugs", "Export drops alpha", "--set", "impact=high")).code, 0)
    assert.equal((await naima(root, "new", "tests", "Export keeps alpha")).code, 0)
    assert.equal((await naima(root, "link", "export-keeps-alpha", "verifies", "export-drops-alpha")).code, 0)
    const shown = await naima(root, "show", "export-drops-alpha")
    assert.match(shown.out, /is proven by tests\/export-keeps-alpha \[open\]  \(inverse\)/)
    assert.match(shown.out, /impact: high/)
    const check = await naima(root, "check")
    assert.equal(check.code, 0, check.out)
    assert.match((await naima(root, "board", "bugs")).out, /1 open, 0 done/)
    assert.match((await naima(root, "unknown")).err, /unknown command/)
    assert.equal((await naima(root, "new", "bugs", "x", "--set", "impact=huge")).code, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a plugin can be loaded from a path in the project", async () => {
  const root = mkdtempSync(join(tmpdir(), "naima-cli-"))
  try {
    writeFileSync(
      join(root, "hello.mjs"),
      `export default (o) => ({ name: "hello", says: "demo", commands: [{ name: "hello", says: "", usage: "hello", run: (_a, ctx) => { ctx.out("hello " + o.who); return 0 } }] })\n`,
    )
    writeFileSync(join(root, "naima.config.json"), JSON.stringify({ trackerDir: "t", plugins: [{ name: "./hello.mjs", options: { who: "world" } }] }))
    const r = await naima(root, "hello")
    assert.equal(r.out, "hello world")
    assert.match(readFileSync(join(root, "naima.config.json"), "utf8"), /hello/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("this repository's config loads every first-party plugin, so its reference documents them all", () => {
  const config = JSON.parse(readFileSync(join(import.meta.dirname, "..", "naima.config.json"), "utf8")) as { plugins: (string | { name: string })[] }
  const loaded = new Set(config.plugins.map((p) => (typeof p === "string" ? p : p.name)))
  for (const name of Object.keys(builtins)) assert.ok(loaded.has(name), `naima.config.json does not load "${name}", so docs/reference.md cannot document it`)
})
