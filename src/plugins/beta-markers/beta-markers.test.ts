import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { createItem, runChecks, setFields, type Plugin } from "../../core/index.ts"
import { tempProject } from "../../core/testing.ts"
import betaMarkers from "./index.ts"

const proofs: Plugin = {
  name: "proofs",
  says: "",
  types: [
    {
      id: "tests",
      dir: "TESTS",
      title: "",
      says: "",
      statuses: { open: { category: "open", says: "" }, passed: { category: "done", proves: true, says: "" } },
      initialStatus: "open",
    },
  ],
}

// Markers are assembled here so this file never contains one itself.
const marker = (ref: string, what: string) => ["// naima", `beta ${ref} ${what}`].join(":")

test("a marker must name an open item and dies with its proof", async () => {
  const p = tempProject([proofs, betaMarkers({ paths: ["app"] })])
  try {
    const t = createItem(p.ctx, p.ctx.registry.types.get("tests")!, "Export keeps alpha")
    mkdirSync(join(p.root, "app", "node_modules"), { recursive: true })
    writeFileSync(join(p.root, "app", "export.ts"), `const x = 1\n  ${marker(`tests/${t.slug}`, "layered export is unproven")}\n`)
    writeFileSync(join(p.root, "app", "node_modules", "dep.ts"), marker("tests/nothing", "skipped") + "\n")
    assert.deepEqual(runChecks(p.ctx).problems, [])
    await p.run("beta")
    assert.match(p.output.join("\n"), /unproven\s+app\/export.ts:2\s+tests\/export-keeps-alpha\s+layered export is unproven/)

    writeFileSync(join(p.root, "app", "other.ts"), marker("tests/ghost", "names nothing") + "\n")
    setFields(p.ctx, t, [["status", "passed"]])
    p.ctx.reload()
    const problems = runChecks(p.ctx).problems.map((f) => f.message).join("\n")
    assert.match(problems, /outlived its proof/)
    assert.match(problems, /names "tests\/ghost", which is no item/)
    assert.equal(await p.run("beta", "--check"), 1)
  } finally {
    p.cleanup()
  }
})
