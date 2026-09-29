import assert from "node:assert/strict"
import { test } from "node:test"
import { byUrgency, createItem, runChecks, type Plugin } from "../../core/index.ts"
import { tempProject } from "../../core/testing.ts"
import triage, { confidenceFrom } from "./index.ts"

const things: Plugin = {
  name: "things",
  says: "test type",
  types: [{ id: "things", dir: "THINGS", title: "Things", says: "", statuses: { open: { category: "open", says: "" }, done: { category: "done", says: "" } }, initialStatus: "open" }],
}

test("set stamps a human decision; derive never touches effort or a decided item", async () => {
  const p = tempProject([things, triage()])
  try {
    const { ctx } = p
    const type = ctx.registry.types.get("things")!
    const a = createItem(ctx, type, "Measured crash")
    const b = createItem(ctx, type, "Vague report")
    await p.run("triage", "set", a.slug, "impact=high", "effort=S")
    let meta = ctx.repo.resolve(a.slug).meta
    assert.deepEqual([meta.impact, meta.effort, meta.triagedOn, meta.triagedBy], ["high", "S", "2026-01-15", undefined])
    await assert.rejects(async () => p.run("triage", "set", a.slug, "effort=huge"), /not one of/)

    await p.run("triage", "derive", "--write")
    meta = ctx.repo.resolve(b.slug).meta
    assert.deepEqual([meta.confidence, meta.triagedBy, meta.effort], ["reported", "derived", undefined])
    assert.equal(ctx.repo.resolve(a.slug).meta.confidence, undefined, "a decided item is left alone")
    assert.deepEqual(runChecks(ctx).problems, [])
  } finally {
    p.cleanup()
  }
})

test("urgency: impact before priority, effort breaks ties, done sinks", () => {
  const p = tempProject([things, triage()])
  try {
    const { ctx } = p
    const type = ctx.registry.types.get("things")!
    createItem(ctx, type, "low", { impact: "low", priority: "now" })
    createItem(ctx, type, "blocker big", { impact: "blocker", effort: "XL" })
    createItem(ctx, type, "blocker small", { impact: "blocker", effort: "S" })
    createItem(ctx, type, "finished", { impact: "blocker", effort: "S", status: "done" })
    assert.deepEqual(byUrgency(ctx, ctx.repo.items).map((i) => i.meta.title), ["blocker small", "blocker big", "low", "finished"])
  } finally {
    p.cleanup()
  }
})

test("confidence is read off the page's own words", () => {
  assert.equal(confidenceFrom("Reproduced twice and measured: 3.2 s"), "measured")
  assert.equal(confidenceFrom("The cause is a race"), "diagnosed")
  assert.equal(confidenceFrom("Not reproduced here"), "unclear")
  assert.equal(confidenceFrom("It broke"), "reported")
})
