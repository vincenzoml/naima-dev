import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { FORMAT, addLink, buildRegistry, createItem, fieldError, findData, parseConfig, runChecks, setFields, slugify, uniqueSlug, type Plugin } from "./index.ts"
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

const LOCK = { source: "https://example.invalid/naima.git", commit: "a".repeat(40) }

test("naima.json: the format, the lock, gates and third-party plugins; nothing to switch on", () => {
  assert.deepEqual(parseConfig({ format: FORMAT, ...LOCK }), { format: FORMAT, ...LOCK, carry: "clone", program: "../naima", gates: {}, plugins: [] })
  const c = parseConfig({ format: FORMAT, ...LOCK, carry: "vendored", gates: { v1: {} }, plugins: ["plugins/a.ts", { name: "plugins/b.ts", options: { k: 1 } }] })
  assert.equal(c.carry, "vendored")
  assert.deepEqual(c.plugins, [{ name: "plugins/a.ts", options: {} }, { name: "plugins/b.ts", options: { k: 1 } }])
  assert.throws(() => parseConfig({ ...LOCK }), /has no format/)
  assert.throws(() => parseConfig({ format: FORMAT, source: "", commit: LOCK.commit }), /source must be/)
  assert.throws(() => parseConfig({ format: FORMAT, ...LOCK, commit: "abc" }), /commit must be the full hash/)
  assert.throws(() => parseConfig({ format: FORMAT, ...LOCK, carry: "zip" }), /carry must be one of: clone, vendored, submodule/)
  assert.throws(() => parseConfig({ format: FORMAT, ...LOCK, naima: "^0.2.0" }), /unknown key "naima"/)
  assert.throws(() => parseConfig({ format: FORMAT, ...LOCK, plugins: [3] }), /a plugin entry/)
})

test("the data directory: --data or NAIMA_DATA, else the first naima-tracker/naima-data/ walking up", () => {
  const p = tempProject([])
  try {
    const deep = join(p.root, "a", "b")
    mkdirSync(deep, { recursive: true })
    assert.equal(findData(deep), join(p.root, "naima-tracker", "naima-data"))
    assert.equal(findData(deep, "../../elsewhere"), join(p.root, "elsewhere"))
    assert.equal(findData(dirname(p.root)), null)
  } finally {
    p.cleanup()
  }
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
    assert.match(text, /STRAY\/ belongs to no loaded type or plugin/)
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

test("a status is only one the type declares itself, never an Object.prototype key", () => {
  const p = tempProject([notes])
  try {
    const item = createItem(p.ctx, p.ctx.registry.types.get("notes")!, "One")
    for (const status of ["__proto__", "constructor", "toString"]) {
      assert.throws(() => setFields(p.ctx, item, [["status", status]]), /is not one of: open, done/)
    }
    const meta = JSON.parse(readFileSync(join(item.dir, "meta.json"), "utf8"))
    writeFileSync(join(item.dir, "meta.json"), JSON.stringify({ ...meta, status: "constructor" }))
    p.ctx.reload()
    assert.match(messages(runChecks(p.ctx)), /status "constructor" is not one of/)
    assert.throws(() => buildRegistry([corePlugin, { ...notes, types: [{ ...notes.types![0]!, initialStatus: "toString" }] }]), /initial status "toString"/)
  } finally {
    p.cleanup()
  }
})

test("a date field holds only a real calendar date", () => {
  const date = { name: "due", kind: "date" as const, says: "" }
  for (const ok of ["2024", "2024-02", "2024-02-29", "2000-02-29", "2023-12-31"]) assert.equal(fieldError(date, ok), null, ok)
  for (const bad of ["2024-13-99", "2024-00", "2024-13", "2023-02-29", "2024-04-31", "2024-01-00", "1900-02-29"]) assert.match(fieldError(date, bad) ?? "", /is not a date/, bad)
  const p = tempProject([notes])
  try {
    const item = createItem(p.ctx, p.ctx.registry.types.get("notes")!, "One")
    assert.throws(() => setFields(p.ctx, item, [["created", "2024-13-99"]]), /is not a date/)
    const meta = JSON.parse(readFileSync(join(item.dir, "meta.json"), "utf8"))
    writeFileSync(join(item.dir, "meta.json"), JSON.stringify({ ...meta, created: "2024-13-99" }))
    p.ctx.reload()
    assert.match(messages(runChecks(p.ctx)), /created "2024-13-99" is not a date/)
  } finally {
    p.cleanup()
  }
})

test("non-Latin titles keep their letters: distinct slugs, and no false duplicates", () => {
  assert.equal(slugify("Café au lait"), "cafe-au-lait")
  assert.equal(slugify("Экспорт теряет альфа-канал"), "экспорт-теряет-альфа-канал")
  assert.equal(slugify("导出丢失透明通道"), "导出丢失透明通道")
  assert.equal(slugify("がぎぐ"), "がぎぐ")
  const p = tempProject([notes])
  try {
    const type = p.ctx.registry.types.get("notes")!
    const a = createItem(p.ctx, type, "Экспорт теряет альфа-канал")
    const b = createItem(p.ctx, type, "Импорт падает")
    const c = createItem(p.ctx, type, "导出丢失透明通道")
    assert.equal(new Set([a.slug, b.slug, c.slug]).size, 3)
    assert.doesNotMatch(runChecks(p.ctx).notes.map((n) => n.message).join(), /possible duplicates/)
    createItem(p.ctx, type, "ЭКСПОРТ теряет альфа канал")
    assert.match(runChecks(p.ctx).notes.map((n) => n.message).join(), /possible duplicates/)
  } finally {
    p.cleanup()
  }
})

test("new never reuses a directory: a slug taken in another case, or by a concurrent run, is suffixed", async () => {
  const p = tempProject([notes])
  try {
    const type = p.ctx.registry.types.get("notes")!
    const first = createItem(p.ctx, type, "Crash save")
    const upper = join(p.ctx.trackerRoot, "NOTES", "Crash-Save-2")
    mkdirSync(upper)
    writeFileSync(join(upper, "meta.json"), JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", title: "Crash-Save", status: "open" }))
    assert.equal(uniqueSlug("crash-save-2", new Set(["Crash-Save-2"])), "crash-save-2-2")
    const second = createItem(p.ctx, type, "Crash save")
    assert.equal(second.slug, "crash-save-3")
    assert.equal(JSON.parse(readFileSync(join(upper, "meta.json"), "utf8")).id, "11111111-1111-4111-8111-111111111111")
    assert.equal(p.ctx.repo.resolve(first.meta.id).slug, "crash-save")

    // Eight processes open the same title at once: eight items, eight directories.
    const cli = join(dirname(dirname(fileURLToPath(import.meta.url))), "cli.ts")
    const runs = Array.from({ length: 8 }, () =>
      new Promise<number>((done) => spawn("deno", ["run", "-A", cli, "--data", p.ctx.trackerRoot, "new", "bugs", "Same title"], { stdio: "ignore" }).on("close", (c) => done(c ?? -1))),
    )
    assert.deepEqual(await Promise.all(runs), Array(8).fill(0))
    const dirs = readdirSync(join(p.ctx.trackerRoot, "bugs"))
    assert.equal(dirs.length, 8)
    const ids = new Set(dirs.map((d) => JSON.parse(readFileSync(join(p.ctx.trackerRoot, "bugs", d, "meta.json"), "utf8")).id))
    assert.equal(ids.size, 8)
  } finally {
    p.cleanup()
  }
})

test("new validates every --set before it writes anything", async () => {
  const p = tempProject([notes])
  try {
    await assert.rejects(p.run("new", "notes", "Half made", "--set", "size=L", "--set", "badfield=1"), /"badfield" is not a field of notes/)
    await assert.rejects(p.run("new", "notes", "Half made", "--set", "size=XXL"), /size: "XXL" is not one of/)
    await assert.rejects(p.run("new", "notes", "Half made", "--set", "status=__proto__"), /is not one of: open, done/)
    const dir = join(p.ctx.trackerRoot, "NOTES")
    assert.deepEqual(existsSync(dir) ? readdirSync(dir) : [], [])
    assert.equal(await p.run("new", "notes", "Half made", "--set", "size=L", "--set", "status=done"), 0)
    const [item] = p.ctx.repo.items
    assert.deepEqual([item?.slug, item?.meta.size, item?.meta.status], ["half-made", "L", "done"])
  } finally {
    p.cleanup()
  }
})

test("an empty item reference is a usage error, never the only item", async () => {
  const p = tempProject([notes])
  try {
    const item = createItem(p.ctx, p.ctx.registry.types.get("notes")!, "Only one")
    assert.throws(() => p.ctx.repo.resolve(""), /no item named/)
    assert.throws(() => p.ctx.repo.resolve("  "), /no item named/)
    await assert.rejects(p.run("show", ""), /usage: naima show <item>/)
    await assert.rejects(p.run("show"), /usage: naima show <item>/)
    await assert.rejects(p.run("set", "", "size=L"), /usage: naima set <item> field=value/)
    await assert.rejects(p.run("set", item.slug), /usage: naima set <item> field=value/)
    assert.equal(p.ctx.repo.resolve(item.meta.id).meta.size, undefined)
  } finally {
    p.cleanup()
  }
})

test("a link is stored in one direction only: its inverse is already the link", async () => {
  const p = tempProject([notes])
  try {
    const type = p.ctx.registry.types.get("notes")!
    const a = createItem(p.ctx, type, "Alpha")
    const b = createItem(p.ctx, type, "Beta")
    const stored = () => p.ctx.repo.items.flatMap((i) => (i.meta.links ?? []).map((l) => `${i.slug} ${l.rel}`))
    assert.equal(await p.run("link", "alpha", "relates-to", "beta"), 0)
    p.output.length = 0
    assert.equal(await p.run("link", "beta", "relates-to", "alpha"), 0)
    assert.deepEqual(p.output, ["already linked"])
    assert.equal(await p.run("link", "alpha", "blocks", "beta"), 0)
    assert.equal(await p.run("link", "beta", "blocked-by", "alpha"), 0)
    p.ctx.reload()
    assert.deepEqual(stored(), ["alpha relates-to", "alpha blocks"])
    assert.equal(p.ctx.repo.linksOf(p.ctx.repo.resolve(b.meta.id)).length, 2)

    const path = join(b.dir, "meta.json")
    const meta = JSON.parse(readFileSync(path, "utf8"))
    writeFileSync(path, JSON.stringify({ ...meta, links: [{ rel: "blocked-by", id: a.meta.id }] }))
    p.ctx.reload()
    assert.match(messages(runChecks(p.ctx)), /both directions of one link are stored/)
  } finally {
    p.cleanup()
  }
})

test("a meta.json whose id, title or status is not a string is unreadable, not a crash", async () => {
  const p = tempProject([notes])
  try {
    const type = p.ctx.registry.types.get("notes")!
    const good = createItem(p.ctx, type, "Good")
    for (const [title, patch] of [["Bad status", { status: 5 }], ["Bad title", { title: ["x"] }], ["Bad id", { id: 7 }]] as const) {
      const item = createItem(p.ctx, type, title)
      const meta = JSON.parse(readFileSync(join(item.dir, "meta.json"), "utf8"))
      writeFileSync(join(item.dir, "meta.json"), JSON.stringify({ ...meta, ...patch }))
    }
    p.ctx.reload()
    assert.equal(await p.run("list"), 0)
    assert.match(p.output.join("\n"), /1 item$/)
    assert.deepEqual(p.ctx.repo.items.map((i) => i.meta.id), [good.meta.id])
    const text = messages(runChecks(p.ctx))
    assert.match(text, /bad-status: meta\.json: status is not a string/)
    assert.match(text, /bad-title: meta\.json: title is not a string/)
    assert.match(text, /bad-id: meta\.json: id is not a string/)
  } finally {
    p.cleanup()
  }
})

test("a directory check cannot read is a problem: a misspelled type, an _underscored or a symlinked item", () => {
  const p = tempProject([notes])
  try {
    const item = createItem(p.ctx, p.ctx.registry.types.get("notes")!, "Real")
    mkdirSync(join(p.ctx.trackerRoot, "NOETS", "typo"), { recursive: true })
    mkdirSync(join(p.ctx.trackerRoot, "NOTES", "_draft"))
    writeFileSync(join(p.ctx.trackerRoot, "NOTES", "_draft", "meta.json"), "{}")
    symlinkSync(item.dir, join(p.ctx.trackerRoot, "NOTES", "linked"), "dir")
    p.ctx.reload()
    const text = messages(runChecks(p.ctx))
    assert.match(text, /NOETS\/ belongs to no loaded type or plugin/)
    assert.match(text, /NOTES\/_draft: not read as an item/)
    assert.match(text, /NOTES\/linked: a symbolic link, not read as an item/)
    assert.equal(p.ctx.repo.items.length, 1)
  } finally {
    p.cleanup()
  }
})

test("a write is seen by the next read in the same run, with no reload", async () => {
  const p = tempProject([notes])
  try {
    const type = p.ctx.registry.types.get("notes")!
    createItem(p.ctx, type, "Alpha")
    createItem(p.ctx, type, "Beta")
    const cmd = (name: string, ...args: string[]) => p.ctx.registry.commands.get(name)!.run(args, p.ctx) // no reload between runs
    await cmd("link", "alpha", "blocks", "beta")
    assert.deepEqual(p.ctx.repo.linksOf(p.ctx.repo.resolve("beta")).map((l) => l.rel), ["blocked-by"])
    await cmd("unlink", "alpha", "blocks", "beta")
    assert.deepEqual(p.ctx.repo.linksOf(p.ctx.repo.resolve("beta")), [])
    await cmd("set", "beta", "size=L")
    assert.equal(p.ctx.repo.resolve("beta").meta.size, "L")
  } finally {
    p.cleanup()
  }
})
