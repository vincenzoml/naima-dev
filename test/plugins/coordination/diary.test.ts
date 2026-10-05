// The diary: events carry the moment they were recorded, the timeline orders
// the events of one day by it, and `naima diary` tells the project's story --
// diary records, decisions with their reasons, session notes -- in order.

import assert from "node:assert/strict"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { createItem, type Plugin, saveMeta, typeOrThrow } from "../../../naima/src/core/api.ts"
import { tempProject } from "../../core/testing.ts"
import coordination from "../../../naima/src/plugins/coordination/index.ts"
import planning from "../../../naima/src/plugins/planning/index.ts"
import { timelineOf } from "../../../naima/src/plugins/coordination/timeline.ts"

const eventsDir = (_root: string, data: string) => join(data, "events")

/** The fields the planning plugin reads, declared as a project's other plugins would. */
const fields = (): Plugin => ({
  name: "fields",
  says: "fields other plugins read",
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

test("an event recorded today carries the moment; an earlier day carries none unless given", async () => {
  const p = tempProject([coordination()])
  try {
    const data = p.ctx.trackerRoot
    assert.equal(await p.run("event", "2026-01-15", "Today's news", "--kind", "diary"), 0)
    assert.equal(await p.run("event", "2026-01-10", "Old news"), 0)
    assert.equal(await p.run("event", "2026-01-12", "Placed news", "--at", "2026-01-12T08:15:00Z"), 0)
    const files = readdirSync(eventsDir(p.root, data)).map((f) => readFileSync(join(eventsDir(p.root, data), f), "utf8"))
    const of = (words: string) => files.find((f) => f.includes(words)) ?? ""
    assert.match(of("Today's news"), /^at: 2026-01-15T10:00:00\.000Z$/m)
    assert.doesNotMatch(of("Old news"), /^at:/m)
    assert.match(of("Placed news"), /^at: 2026-01-12T08:15:00\.000Z$/m)
    await assert.rejects(p.run("event", "2026-01-12", "Wrong day", "--at", "2026-01-13T08:15:00Z"), /not on the event's day/)
  } finally {
    p.cleanup()
  }
})

test("the timeline orders the events of one day by their moment", async () => {
  const p = tempProject([coordination()])
  try {
    await p.run("event", "2026-01-15", "Second", "--kind", "diary", "--at", "2026-01-15T11:00:00Z")
    await p.run("event", "2026-01-15", "First", "--kind", "diary", "--at", "2026-01-15T09:00:00Z")
    p.ctx.reload()
    const says = timelineOf(p.ctx, []).events.map((e) => e.says)
    assert.ok(says.findIndex((s) => s.includes("First")) < says.findIndex((s) => s.includes("Second")), says.join(" | "))
  } finally {
    p.cleanup()
  }
})

test("the diary tells decisions with their reasons, diary records and session notes, in order", async () => {
  const p = tempProject([fields(), coordination(), planning()])
  try {
    const { ctx } = p
    const d = createItem(ctx, typeOrThrow(ctx, "decisions"), "The GIL is always off")
    saveMeta(ctx, { ...d, meta: { ...d.meta, decidedOn: "2026-01-15", created: "2026-01-15" } })
    writeFileSync(
      join(ctx.trackerRoot, "decisions", d.slug, "README.md"),
      "# The GIL is always off\n\n## The owner's words, restated\n\nAlways off.\n\n## Why\n\nParallel calls into Python are the point.\n",
    )
    await p.run("event", "2026-01-15", "Work started", "--kind", "diary", "--at", "2026-01-15T09:00:00Z")
    await p.run("event", "2026-01-15", "Plan entered", "--kind", "diary", "--at", "2026-01-15T12:00:00Z")
    await p.run("event", "2026-01-15", "Not for the diary", "--kind", "build", "--at", "2026-01-15T10:00:00Z")
    const passes = join(ctx.trackerRoot, "passes")
    mkdirSync(passes, { recursive: true })
    writeFileSync(
      join(passes, "2026-01-15-00000000-0000-0000-0000-000000000001.md"),
      "---\ndate: 2026-01-15\nat: 2026-01-15T13:00:00.000Z\nbranch: main\n---\n\nDay one closed.\n",
    )
    ctx.reload()
    p.output.length = 0
    assert.equal(await p.run("diary"), 0)
    const text = p.output.join("\n")
    const at = (s: string) => text.indexOf(s)
    assert.ok(at("2026-01-15") >= 0)
    assert.ok(at("The GIL is always off") >= 0 && at("Parallel calls into Python are the point.") >= 0, text)
    assert.ok(at("Work started") < at("Plan entered") && at("Plan entered") < at("Day one closed."), text)
    assert.equal(at("Not for the diary"), -1)
  } finally {
    p.cleanup()
  }
})
