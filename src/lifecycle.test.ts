// The item lifecycle across the first-party plugins together: what one
// plugin's write hook or status flag does to another's command.

import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { firstParty } from "./builtins.ts"
import { tempProject } from "./core/testing.ts"

const project = (gates: Record<string, unknown> = {}) => tempProject(firstParty({ gates }), { git: true })

test("a branch does not close an item it claims on its own tests; --force, from the evidence owner, does", async () => {
  const p = project()
  try {
    p.git("checkout", "-q", "-b", "fix/x")
    assert.equal(await p.run("new", "bugs", "X broken", "--set", "fixedOn=2026-01-15"), 0)
    assert.equal(await p.run("claim", "x-broken"), 0)
    assert.equal(await p.run("new", "tests", "X works", "--set", "status=passed"), 0)
    assert.equal(await p.run("link", "x-works", "verifies", "x-broken"), 0)
    await assert.rejects(p.run("close", "x-broken"), /claimed by fix\/x, the branch you are on.*--force/)
    assert.ok(existsSync(join(p.ctx.trackerRoot, "bugs", "x-broken", "meta.json")), "refused: the item stays where it was")
    assert.equal(p.ctx.repo.resolve("x-broken").meta.status, "open", "and as it was")
    assert.equal(await p.run("close", "x-broken", "--force"), 0)
    assert.equal(p.ctx.repo.resolve("x-broken").type, "closed")
  } finally {
    p.cleanup()
  }
})

test("an item another branch claims, or nobody does, closes from here", async () => {
  const p = project()
  try {
    assert.equal(await p.run("new", "bugs", "X broken", "--set", "fixedOn=2026-01-15"), 0)
    assert.equal(await p.run("new", "tests", "X works", "--set", "status=passed"), 0)
    assert.equal(await p.run("link", "x-works", "verifies", "x-broken"), 0)
    p.git("add", "-A")
    p.git("commit", "-q", "-m", "items")
    p.git("checkout", "-q", "-b", "fix/x")
    assert.equal(await p.run("claim", "x-broken"), 0)
    p.git("add", "-A")
    p.git("commit", "-q", "-m", "claim")
    p.git("checkout", "-q", "main")
    assert.equal(await p.run("close", "x-broken"), 0, "fix/x claims it, not main")
  } finally {
    p.cleanup()
  }
})
