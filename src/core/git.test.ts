import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { test } from "node:test"
import { gitCalls } from "./git.ts"
import { gitPath, projectFiles, readAcrossBranches, refsWorthReading, walkFiles } from "./index.ts"
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

test("a project's files are regular files: never a submodule's directory, never through a symbolic link", () => {
  const p = tempProject([], { git: true })
  const outside = mkdtempSync(join(tmpdir(), "naima-outside-"))
  try {
    writeFileSync(join(outside, "secret.md"), "outside the repository\n")
    mkdirSync(join(outside, "tree"))
    writeFileSync(join(outside, "tree", "deep.ts"), "outside\n")
    mkdirSync(join(p.root, "src"))
    writeFileSync(join(p.root, "src", "a.ts"), "inside\n")
    symlinkSync(join(outside, "secret.md"), join(p.root, "src", "leak.md"))
    symlinkSync(join(outside, "tree"), join(p.root, "src", "tree"), "dir")
    // A submodule: git lists its path, and on disk it is a directory.
    mkdirSync(join(p.root, "vendor.md"))
    p.git("update-index", "--add", "--cacheinfo", `160000,${p.git("rev-parse", "HEAD")},vendor.md`)
    const files = projectFiles(p.root).filter((f) => !f.startsWith("naima-tracker/"))
    assert.deepEqual(files, ["src/a.ts"])
    rmSync(join(p.root, ".git"), { recursive: true, force: true })
    assert.deepEqual(projectFiles(p.root).filter((f) => !f.startsWith("naima-tracker/")), ["src/a.ts"])
    assert.deepEqual(walkFiles(join(p.root, "src")).map((f) => relative(p.root, f)), [join("src", "a.ts")])
  } finally {
    p.cleanup()
    rmSync(outside, { recursive: true, force: true })
  }
})

test("paths meet git in posix form, whatever the platform's separator", () => {
  assert.equal(gitPath("naima-tracker\\naima-data\\claims", "\\"), "naima-tracker/naima-data/claims")
  assert.equal(gitPath("naima-tracker/naima-data/claims", "/"), "naima-tracker/naima-data/claims")
  const p = tempProject([], { git: true })
  try {
    mkdirSync(join(p.root, "src", "deep"), { recursive: true })
    writeFileSync(join(p.root, "src", "deep", "a.ts"), "x\n")
    rmSync(join(p.root, ".git"), { recursive: true, force: true })
    assert.ok(projectFiles(p.root).includes("src/deep/a.ts"), "outside git too, a project file is a posix path")
  } finally {
    p.cleanup()
  }
})

test("reading across branches starts a bounded number of git processes, however many branches and files", () => {
  const p = tempProject([], { git: true })
  try {
    const dir = "naima-tracker/naima-data/claims"
    const calls = (): number => {
      const before = gitCalls()
      readAcrossBranches(p.root, dir, ".json")
      return gitCalls() - before
    }
    const branches = (from: number, to: number): void => {
      for (let n = from; n < to; n++) {
        p.git("checkout", "-q", "-b", `b${n}`, "main")
        mkdirSync(join(p.root, dir), { recursive: true })
        for (const k of [1, 2, 3]) writeFileSync(join(p.root, dir, `b${n}-${k}.json`), `{"n":${n}}\n`)
        p.git("add", "-A")
        p.git("commit", "-q", "-m", `b${n}`)
      }
      p.git("checkout", "-q", "main")
    }
    branches(0, 2)
    const few = calls()
    branches(2, 10)
    const many = calls()
    assert.equal(readAcrossBranches(p.root, dir, ".json").length, 30)
    assert.equal(many, few, `2 branches took ${few} git processes, 10 took ${many}`)
    assert.ok(many <= 8, `${many} git processes for one read`)
  } finally {
    p.cleanup()
  }
})
