import assert from "node:assert/strict"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { readAcrossBranches, refsWorthReading } from "./index.ts"
import { tempProject } from "./testing.ts"

test("records are recombined from every unmerged branch, with the working tree winning", () => {
  const p = tempProject([], { git: true })
  try {
    const dir = join(p.root, "rec")
    const put = (name: string, text: string) => {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, name), text)
    }
    p.git("checkout", "-q", "-b", "one")
    put("a.txt", "from one")
    p.git("add", "-A")
    p.git("commit", "-q", "-m", "one")
    p.git("checkout", "-q", "main")
    rmSync(dir, { recursive: true, force: true })
    put("b.txt", "uncommitted on main")
    assert.deepEqual(refsWorthReading(p.root), ["one", "main"])
    const files = readAcrossBranches(p.root, "rec", ".txt").map((f) => [f.name, f.ref, f.local, f.text])
    assert.deepEqual(files.sort(), [
      ["a.txt", "one", false, "from one"],
      ["b.txt", "main", true, "uncommitted on main"],
    ])
    // once merged, the branch adds nothing and is no longer read
    p.git("add", "-A")
    p.git("commit", "-q", "-m", "b")
    p.git("merge", "-q", "--no-edit", "one")
    assert.deepEqual(refsWorthReading(p.root), ["main"])
  } finally {
    p.cleanup()
  }
})
