import assert from "node:assert/strict"
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { createItem, runChecks, type Plugin, type Verifier } from "../../core/index.ts"
import { tempProject } from "../../core/testing.ts"
import { exampleRegex } from "./adapters/example-regex.ts"
import verifier, { readRun } from "./index.ts"

test("a run is attached as evidence, with the counterexample and the model's hash", async () => {
  const p = tempProject([verifier()])
  try {
    const { ctx } = p
    writeFileSync(join(p.root, "model.txt"), "init x = 0\nnext x' = x + 1\n")
    const prop = createItem(ctx, ctx.registry.types.get("properties")!, "x is never negative", {
      verifier: "example-regex",
      model: "model.txt",
      property: "never x = -",
    })
    assert.equal(await p.run("verify", prop.slug), 0)
    let item = ctx.repo.resolve(prop.slug)
    assert.equal(item.meta.status, "holds")
    assert.equal(readRun(item)?.verdict, "holds")
    assert.deepEqual(runChecks(ctx).problems, [])
    assert.ok(ctx.registry.gates.get("properties")!.evaluate(ctx).holds)

    // the model changes: the old verdict is no longer evidence
    writeFileSync(join(p.root, "model.txt"), "init x = 0\nnext x' = x - 1\nassume x = -1\n")
    assert.match(runChecks(ctx).problems.map((f) => f.message).join(), /model that has changed/)

    assert.equal(await p.run("verify", "--all"), 1)
    item = ctx.repo.resolve(prop.slug)
    assert.equal(item.meta.status, "violated")
    const files = readdirSync(join(item.dir, "attachments"))
    const cex = files.find((f) => f.startsWith("counterexample-"))
    assert.ok(cex)
    assert.equal(readFileSync(join(item.dir, "attachments", cex), "utf8"), "3: assume x = -1\n")
    assert.deepEqual(runChecks(ctx).problems, [])
    assert.equal(ctx.registry.gates.get("properties")!.evaluate(ctx).holds, false)
  } finally {
    p.cleanup()
  }
})

test("adapters come from any plugin; a missing verifier or model is a problem", async () => {
  const always: Verifier = { id: "always", says: "", verify: async () => ({ verdict: "holds", output: "ok" }) }
  const extra: Plugin = { name: "extra", says: "", verifiers: [always] }
  const p = tempProject([verifier(), extra])
  try {
    const { ctx } = p
    writeFileSync(join(p.root, "m"), "")
    const type = ctx.registry.types.get("properties")!
    const ok = createItem(ctx, type, "fine", { verifier: "always", model: "m", property: "anything" })
    createItem(ctx, type, "broken", { verifier: "nope", model: "gone", property: "p" })
    assert.equal(await p.run("verify", ok.slug), 0)
    const problems = runChecks(ctx).problems.map((f) => f.message).join("\n")
    assert.match(problems, /verifier "nope" is not loaded/)
    assert.match(problems, /model gone does not exist/)
    await assert.rejects(async () => p.run("verify", "broken"), /no verifier "nope"/)
  } finally {
    p.cleanup()
  }
})

test("the example adapter reads lines as written: no phantom last line, no trailing \\r", async () => {
  const dir = mkdtempSync(join(tmpdir(), "naima-regex-"))
  try {
    const run = async (text: string, property: string) => {
      writeFileSync(join(dir, "m.txt"), text)
      return (await exampleRegex.verify({ model: join(dir, "m.txt"), property, options: {} }, {} as never)).verdict
    }
    assert.equal(await run("a\nb\n", "never ^$"), "holds")
    assert.equal(await run("a\r\nb\r\n", "never ^$"), "holds")
    assert.equal(await run("a\r\nb\r\n", "some ^b$"), "holds")
    assert.equal(await run("a\n\nb\n", "never ^$"), "violated")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
