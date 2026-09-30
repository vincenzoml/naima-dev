// Forward-only, deterministic migration, and the refusals around it. The
// migrations here are fixtures: the shipped list is empty while format 1 is
// the only format, and the mechanism must already hold.

import assert from "node:assert/strict"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { test } from "node:test"
import { FORMAT, MIGRATIONS, createItem, formatCheck, formatRefusal, migrate, runChecks, type Migration } from "./index.ts"
import { tempProject } from "./testing.ts"

/** Format 1 → 2 renames the item field `area` to `where`; 2 → 3 adds `carry` to naima.json. */
const fixture: Migration[] = [
  {
    from: 1,
    says: "area became where",
    item: ({ area, ...rest }) => (area === undefined ? rest : { ...rest, where: area }),
    stale: (meta) => "area" in meta,
  },
  { from: 2, says: "naima.json names its carry", config: (raw) => ({ ...raw, carry: raw.carry ?? "clone" }) },
]

function files(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name)
      if (statSync(path).isDirectory()) walk(path)
      else out[relative(dir, path)] = readFileSync(path, "utf8")
    }
  }
  walk(dir)
  return out
}

function formatOneData(): string {
  const data = mkdtempSync(join(tmpdir(), "naima-format-"))
  writeFileSync(join(data, "naima.json"), `{"source":"s","format":1,"commit":"${"a".repeat(40)}","gates":{}}`)
  for (const [slug, meta] of [
    ["alpha", { title: "Alpha", id: "1", status: "open", area: "export" }],
    ["beta", { id: "2", title: "Beta", status: "open" }],
  ] as const) {
    mkdirSync(join(data, "bugs", slug), { recursive: true })
    writeFileSync(join(data, "bugs", slug, "meta.json"), JSON.stringify(meta))
  }
  return data
}

test("this Naima reads format 1 + the number of migrations it carries", () => {
  assert.equal(FORMAT, 1 + MIGRATIONS.length)
  assert.equal(formatRefusal(FORMAT), null)
})

test("migration is forward only and deterministic: the same input gives byte-identical output, and again changes nothing", () => {
  const one = formatOneData()
  const two = mkdtempSync(join(tmpdir(), "naima-format-"))
  try {
    cpSync(one, two, { recursive: true })
    assert.deepEqual(migrate(one, fixture), [1, 2])
    assert.deepEqual(migrate(two, fixture), [1, 2])
    const after = files(one)
    assert.deepEqual(files(two), after, "byte-identical")
    assert.deepEqual(JSON.parse(after["naima.json"] ?? ""), { format: 3, source: "s", commit: "a".repeat(40), gates: {}, carry: "clone" })
    assert.equal(after[join("bugs", "alpha", "meta.json")], JSON.stringify({ title: "Alpha", id: "1", status: "open", where: "export" }, null, 2) + "\n")
    assert.deepEqual(migrate(one, fixture), [], "idempotent")
    assert.deepEqual(files(one), after)
  } finally {
    rmSync(one, { recursive: true, force: true })
    rmSync(two, { recursive: true, force: true })
  }
})

test("newer data is refused and left as it was; a migration that throws writes nothing", () => {
  const data = formatOneData()
  try {
    const before = files(data)
    writeFileSync(join(data, "naima.json"), JSON.stringify({ format: 4 }))
    assert.throws(() => migrate(data, fixture), /^Error: naima\.json is format 4, newer than the format 3 this Naima reads — it was written by a newer Naima: record that Naima's commit$/)
    writeFileSync(join(data, "naima.json"), before["naima.json"] ?? "")
    const broken: Migration[] = [fixture[0] as Migration, { from: 2, says: "throws", config: () => { throw new Error("boom") } }]
    assert.throws(() => migrate(data, broken), /boom/)
    assert.deepEqual(files(data), before)
    assert.throws(() => migrate(data, [{ from: 2, says: "gap" }]), /no gap/)
  } finally {
    rmSync(data, { recursive: true, force: true })
  }
})

test("check fails on a tracker that mixes formats", () => {
  const p = tempProject([{ name: "mixed", says: "the fixture's format check", checks: [formatCheck(fixture)] }, {
    name: "bugs",
    says: "a type",
    types: [{ id: "bugs", dir: "bugs", title: "Bugs", says: "bugs", statuses: { open: { category: "open", says: "open" } }, initialStatus: "open" }],
  }])
  try {
    const type = p.ctx.registry.types.get("bugs")!
    createItem(p.ctx, type, "Migrated", { where: "export" })
    assert.equal(runChecks(p.ctx).problems.length, 0)
    createItem(p.ctx, type, "Merged from an old branch", { area: "export" })
    assert.deepEqual(
      runChecks(p.ctx).problems.map((f) => f.message),
      ["bugs/merged-from-old-branch is still in format 1 (area became where) — naima update migrates it"],
    )
  } finally {
    p.cleanup()
  }
})
