// Dependencies: `blocked-by` says what an item waits on. `naima ready` lists
// what can start now, `naima order` the whole order with each item's depth,
// and a cycle -- a plan that can never start -- fails the check.

import assert from "node:assert/strict"
import { test } from "node:test"
import { addLink, createItem, type Plugin, runChecks, saveMeta, typeOrThrow } from "../../../naima/src/core/api.ts"
import { tempProject } from "../../core/testing.ts"
import gates from "../../../naima/src/plugins/gates/index.ts"

const fixture = (): Plugin => ({
  name: "fixture",
  says: "work items",
  types: [{
    id: "todos",
    dir: "TODOS",
    title: "",
    says: "",
    statuses: { open: { category: "open", says: "" }, done: { category: "done", says: "" } },
    initialStatus: "open",
  }],
  fields: [
    { name: "fixedOn", kind: "date", says: "" },
    { name: "closedOn", kind: "date", says: "" },
    { name: "runBy", kind: "string", says: "" },
    { name: "humanBecause", kind: "string", says: "" },
  ],
  relations: [
    { name: "verifies", inverse: "verified-by", says: "" },
    { name: "verified-by", inverse: "verifies", says: "" },
  ],
})

function plan() {
  const p = tempProject([fixture(), gates()])
  const { ctx } = p
  const todo = (title: string, status = "open") => {
    const i = createItem(ctx, typeOrThrow(ctx, "todos"), title)
    saveMeta(ctx, { ...i, meta: { ...i.meta, status } })
    return ctx.repo.resolve(i.slug)
  }
  const done = todo("Done long ago", "done")
  const req = todo("Write the requirements")
  const spec = todo("Write the specification")
  const model = todo("Model it")
  const docs = todo("Write the docs")
  addLink(ctx, req, "blocked-by", done) // settled: does not hold anything back
  addLink(ctx, spec, "blocked-by", req)
  addLink(ctx, model, "blocked-by", spec)
  addLink(ctx, docs, "blocked-by", req)
  ctx.reload()
  return { p, ctx, req, spec, model, docs, done }
}

test("ready lists the open items whose every blocker is settled", async () => {
  const { p, req, spec, model, done } = plan()
  try {
    assert.equal(await p.run("ready"), 0)
    const text = p.output.join("\n")
    assert.ok(text.includes(req.slug), text)
    assert.ok(!text.includes(spec.slug), text)
    assert.ok(!text.includes(model.slug), text)
    assert.ok(!text.includes(done.slug), text)
  } finally {
    p.cleanup()
  }
})

test("order puts every open item after what it waits on, with its depth", async () => {
  const { p, req, spec, model, docs } = plan()
  try {
    assert.equal(await p.run("order"), 0)
    const lines = p.output.filter((l) => l.includes("todos/"))
    const at = (slug: string) => lines.findIndex((l) => l.includes(`todos/${slug} `))
    assert.ok(at(req.slug) >= 0 && at(req.slug) < at(spec.slug), lines.join("\n"))
    assert.ok(at(spec.slug) < at(model.slug), lines.join("\n"))
    assert.ok(at(req.slug) < at(docs.slug), lines.join("\n"))
    assert.match(lines[at(req.slug)] ?? "", /^\s*0\s/)
    assert.match(lines[at(model.slug)] ?? "", /^\s*2\s/)
  } finally {
    p.cleanup()
  }
})

test("a cycle of blocked-by links fails the check, naming every item on it", async () => {
  const { p, ctx, req, spec, model, docs } = plan()
  try {
    const clean = await runChecks(ctx)
    assert.equal(clean.problems.filter((f) => /cycle/.test(f.message)).length, 0)
    addLink(ctx, req, "blocked-by", model)
    ctx.reload()
    const { problems } = await runChecks(ctx)
    const cycle = problems.find((f) => /cycle/.test(f.message))
    assert.ok(cycle, "no cycle reported")
    for (const i of [req, spec, model]) assert.ok(cycle.message.includes(i.slug), cycle.message)
    assert.ok(!cycle.message.includes(docs.slug), cycle.message)
  } finally {
    p.cleanup()
  }
})
