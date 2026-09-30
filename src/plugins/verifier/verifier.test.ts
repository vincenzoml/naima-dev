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

test("an adapter outside the contract gives a property in error with a readable output, never a status-less one", async () => {
  const bad = (id: string, verify: () => Promise<unknown>): Verifier => ({ id, says: "", verify: verify as Verifier["verify"] })
  const extra: Plugin = {
    name: "extra",
    says: "",
    verifiers: [
      bad("pass", async () => ({ verdict: "pass", output: "fine" })),
      bad("silent", async () => ({ verdict: "holds" })),
      bad("nothing", async () => undefined),
      bad("throws", async () => {
        throw "a string, not an Error"
      }),
    ],
  }
  const p = tempProject([verifier(), extra])
  try {
    const { ctx } = p
    writeFileSync(join(p.root, "m"), "")
    for (const [id, output] of [["pass", /verdict "pass", outside the contract/], ["silent", /no string output/], ["nothing", /not a result/], ["throws", /a string, not an Error/]] as const) {
      const item = createItem(ctx, ctx.registry.types.get("properties")!, `by ${id}`, { verifier: id, model: "m", property: "p" })
      assert.equal(await p.run("verify", item.slug), 1, id)
      const after = ctx.repo.resolve(item.slug)
      assert.equal(after.meta.status, "error", id)
      assert.match(readRun(after)?.output ?? "", output, id)
    }
    assert.deepEqual(runChecks(ctx).problems, [])
  } finally {
    p.cleanup()
  }
})

test("a property holds only for what was run: a changed property, verifier, model path or options is reported", async () => {
  const other: Verifier = { id: "other", says: "", verify: async () => ({ verdict: "holds", output: "ok" }) }
  const p = tempProject([verifier(), { name: "extra", says: "", verifiers: [other] }])
  try {
    const { ctx } = p
    writeFileSync(join(p.root, "model.txt"), "alpha\nbeta\n")
    writeFileSync(join(p.root, "copy.txt"), "alpha\nbeta\n")
    const prop = createItem(ctx, ctx.registry.types.get("properties")!, "has beta", { verifier: "example-regex", model: "model.txt", property: "some beta", verifierOptions: { depth: 1 } })
    assert.equal(await p.run("verify", prop.slug), 0)
    const problems = () => runChecks(ctx).problems.map((f) => f.message).join("\n")
    assert.equal(problems(), "")
    const path = join(prop.dir, "meta.json")
    const held = JSON.parse(readFileSync(path, "utf8"))
    for (const [change, why] of [
      [{ property: "some gamma" }, /holds for property "some beta", not "some gamma"/],
      [{ verifier: "other" }, /holds by verifier "example-regex", not "other"/],
      [{ model: "copy.txt" }, /holds on model model\.txt, not copy\.txt/],
      [{ verifierOptions: { depth: 2 } }, /holds with other verifierOptions/],
    ] as const) {
      writeFileSync(path, JSON.stringify({ ...held, ...change }))
      p.ctx.reload()
      assert.match(problems(), why)
      assert.match(problems(), /run naima verify again/)
    }
  } finally {
    p.cleanup()
  }
})

test("a property's inputs are checked: its options are a declared field, its paths stay inside, its run record is read with care", async () => {
  const p = tempProject([verifier()])
  try {
    const { ctx } = p
    writeFileSync(join(p.root, "m"), "x\n")
    const type = ctx.registry.types.get("properties")!
    assert.equal(ctx.registry.fields.get("verifierOptions")?.kind, "object")
    assert.equal(await p.run("new", "properties", "has options", "--set", 'verifierOptions={"depth":2}', "--set", "verifier=example-regex", "--set", "model=m", "--set", "property=some x"), 0)
    assert.deepEqual(ctx.repo.resolve("has-options").meta.verifierOptions, { depth: 2 })
    await assert.rejects(p.run("set", "has-options", "verifierOptions=[1]"), /verifierOptions: "\[1\]" is not a JSON object/)

    const escape = createItem(ctx, type, "escapes", { verifier: "example-regex", model: "../../../../etc/passwd", property: "some root" })
    await assert.rejects(p.run("verify", escape.slug), /model \.\.\/\.\.\/\.\.\/\.\.\/etc\/passwd is outside the project/)
    const absolute = createItem(ctx, type, "absolute", { verifier: "example-regex", model: "/etc/passwd", property: "some root" })
    await assert.rejects(p.run("verify", absolute.slug), /model \/etc\/passwd is outside the project/)

    const ok = createItem(ctx, type, "fine", { verifier: "example-regex", model: "m", property: "some x" })
    assert.equal(await p.run("verify", ok.slug), 0)
    const path = join(ok.dir, "meta.json")
    const meta = JSON.parse(readFileSync(path, "utf8"))
    writeFileSync(join(ok.dir, "attachments", meta.lastRun), JSON.stringify({ verdict: "holds" }))
    const problems = () => runChecks(ctx).problems.map((f) => f.message).join("\n")
    assert.match(problems(), /fine: holds, but its run record .* is malformed/)
    writeFileSync(path, JSON.stringify({ ...meta, lastRun: "../../escapes/meta.json" }))
    p.ctx.reload()
    assert.match(problems(), /fine: lastRun "\.\.\/\.\.\/escapes\/meta\.json" is not a file name in attachments\//)
    assert.match(problems(), /escapes: model \.\.\/\.\.\/\.\.\/\.\.\/etc\/passwd is outside the project/)
  } finally {
    p.cleanup()
  }
})
