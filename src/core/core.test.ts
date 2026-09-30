import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { addLink, buildRegistry, createItem, maxSatisfying, parseConfig, satisfies, runChecks, setFields, slugify, uniqueSlug, type Plugin } from "./index.ts"
import { corePlugin } from "./base.ts"
import { tempProject } from "./testing.ts"

const notes: Plugin = {
  name: "notes",
  says: "a minimal item type for testing the core",
  types: [
    {
      id: "notes",
      dir: "NOTES",
      title: "Notes",
      says: "a note",
      statuses: { open: { category: "open", says: "open" }, done: { category: "done", proves: true, says: "done" } },
      initialStatus: "open",
    },
  ],
  fields: [{ name: "size", kind: "enum", says: "size", values: { S: "small", L: "large" } }],
}

const messages = (r: { problems: { message: string }[] }) => r.problems.map((p) => p.message).join("\n")

test("slugs are readable, bounded and unique", () => {
  assert.equal(slugify("The export drops the Alpha channel!"), "export-drops-alpha-channel")
  assert.equal(slugify("???"), "item")
  assert.equal(uniqueSlug("a", new Set(["a", "a-2"])), "a-3")
})

test("the registry refuses a name declared twice", () => {
  assert.throws(() => buildRegistry([corePlugin, notes, { ...notes, name: "other" }]), /type "notes" is declared by both/)
  assert.throws(() => buildRegistry([corePlugin, { name: "x", says: "", relations: [{ name: "r", inverse: "q", says: "" }] }]), /inverse "q"/)
  assert.throws(() => buildRegistry([corePlugin, { name: "x", says: "", fields: [{ name: "f", kind: "string", says: "", appliesTo: ["nope"] }] }]), /no plugin declares/)
})

test("config: only the pin, gates and third-party plugins; nothing to switch on", () => {
  assert.deepEqual(parseConfig({ naima: "^0.2.0" }), { pin: "^0.2.0", gates: {}, plugins: [] })
  const c = parseConfig({ naima: "^0.2.0", gates: { v1: {} }, plugins: ["./a.mjs", { name: "b", options: { k: 1 } }] })
  assert.deepEqual(c.plugins, [{ name: "./a.mjs", options: {} }, { name: "b", options: { k: 1 } }])
  assert.throws(() => parseConfig({}), /naima must be the pin/)
  assert.throws(() => parseConfig({ naima: "not a range" }), /naima must be the pin/)
  assert.throws(() => parseConfig({ naima: "*", trackerDir: "t" }), /unknown key "trackerDir"/)
  assert.throws(() => parseConfig({ naima: "*", plugins: [3] }), /a plugin entry/)
})

test("semver: the ranges a pin is written in", () => {
  assert.ok(satisfies("0.2.0", "^0.2.0"))
  assert.ok(satisfies("0.2.9", "^0.2.0"))
  assert.ok(!satisfies("0.3.0", "^0.2.0"))
  assert.ok(!satisfies("0.1.0", "^0.2.0"))
  assert.ok(satisfies("1.4.0", "^1.2.3") && !satisfies("2.0.0", "^1.2.3"))
  assert.ok(satisfies("1.2.9", "~1.2.3") && !satisfies("1.3.0", "~1.2.3"))
  assert.ok(satisfies("1.2.7", "1.2.x") && satisfies("1.9.0", "1.x") && satisfies("3.0.0", "*"))
  assert.ok(satisfies("1.5.0", ">=1.2.0 <2.0.0") && !satisfies("2.0.0", ">=1.2.0 <2.0.0"))
  assert.ok(satisfies("3.0.0", "^1.0.0 || ^3.0.0"))
  assert.ok(!satisfies("0.3.0-dev", "^0.2.0"))
  assert.equal(maxSatisfying(["v0.1.0", "v0.2.0", "v0.2.3", "v0.3.0", "junk"], "^0.2.0"), "v0.2.3")
  assert.equal(maxSatisfying(["v0.1.0"], "^0.2.0"), null)
})

test("an item is a directory with a uuid, and links are resolved in both directions", async () => {
  const p = tempProject([notes])
  try {
    const type = p.ctx.registry.types.get("notes")!
    const a = createItem(p.ctx, type, "First note")
    const b = createItem(p.ctx, type, "First note")
    assert.equal(b.slug, "first-note-2")
    assert.match(readFileSync(join(a.dir, "README.md"), "utf8"), /First note/)
    addLink(p.ctx, p.ctx.repo.resolve(a.meta.id), "blocks", p.ctx.repo.resolve(b.meta.id))
    const back = p.ctx.repo.linksOf(p.ctx.repo.resolve("first-note-2"))
    assert.deepEqual(back, [{ rel: "blocked-by", id: a.meta.id, implied: true }])
    assert.throws(() => p.ctx.repo.resolve("first"), /ambiguous/)
    assert.equal(runChecks(p.ctx).problems.length, 0, messages(runChecks(p.ctx)))
    assert.match(runChecks(p.ctx).notes.map((n) => n.message).join(), /possible duplicates/)
  } finally {
    p.cleanup()
  }
})

test("check reports every broken invariant instead of crashing", () => {
  const p = tempProject([notes])
  try {
    const type = p.ctx.registry.types.get("notes")!
    const a = createItem(p.ctx, type, "One")
    const b = createItem(p.ctx, type, "Two")
    const meta = JSON.parse(readFileSync(join(b.dir, "meta.json"), "utf8"))
    Object.assign(meta, { id: a.meta.id, status: "weird", size: "XXL", links: [{ rel: "nope", id: "missing" }, "junk"] })
    writeFileSync(join(b.dir, "meta.json"), JSON.stringify(meta))
    mkdirSync(join(p.ctx.trackerRoot, "NOTES", "broken"))
    writeFileSync(join(p.ctx.trackerRoot, "NOTES", "broken", "meta.json"), "{ not json")
    mkdirSync(join(p.ctx.trackerRoot, "STRAY"))
    p.ctx.reload()
    const report = runChecks(p.ctx)
    const text = messages(report)
    for (const expected of [/shares its id/, /status "weird"/, /size "XXL"/, /relation "nope"/, /which is no item/, /malformed link/, /broken: meta.json is not a JSON object/]) {
      assert.match(text, expected)
    }
    assert.match(report.notes.map((n) => n.message).join(), /STRAY/)
  } finally {
    p.cleanup()
  }
})

test("set validates against the field's declaration", () => {
  const p = tempProject([notes])
  try {
    const item = createItem(p.ctx, p.ctx.registry.types.get("notes")!, "One")
    setFields(p.ctx, item, [["size", "L"], ["tags", "a, b"], ["status", "done"]])
    assert.deepEqual([item.meta.size, item.meta.tags, item.meta.status], ["L", ["a", "b"], "done"])
    assert.throws(() => setFields(p.ctx, item, [["size", "M"]]), /not one of: S, L/)
    assert.throws(() => setFields(p.ctx, item, [["colour", "red"]]), /not a field/)
    setFields(p.ctx, item, [["size", ""]])
    assert.equal(item.meta.size, undefined)
  } finally {
    p.cleanup()
  }
})

test("board and summary are derived from the items", async () => {
  const p = tempProject([notes])
  try {
    const type = p.ctx.registry.types.get("notes")!
    createItem(p.ctx, type, "Alpha", { section: "Later" })
    createItem(p.ctx, type, "Beta")
    assert.equal(await p.run("board", "notes"), 0)
    const out = p.output.join("\n")
    assert.match(out, /2 open, 0 done/)
    assert.ok(out.indexOf("## Later") < out.indexOf("## (no section)"))
    p.output.length = 0
    await p.run("summary")
    assert.match(p.output.join("\n"), /notes\s+2 open\s+0 done/)
  } finally {
    p.cleanup()
  }
})
