// The agent skill: it exists where agent tools look for it, it loads (front
// matter with the name of its directory and a description), and every link
// it points through resolves.

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { brokenLinks } from "./plugins/docs/index.ts"

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))

test("skills/naima/SKILL.md loads, and its links resolve", () => {
  const text = readFileSync(join(REPO, "skills", "naima", "SKILL.md"), "utf8")
  const front = text.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(front?.[1], "front matter between --- lines")
  const fields = Object.fromEntries(front[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]))
  assert.equal(fields.name, "naima", "the name is the directory's")
  assert.ok((fields.description ?? "").length > 40, "a description that says when to use it")
  assert.match(text, /npx naima init/, "it starts a project that has no naima/")
  assert.match(text, /git clone .* npm link/, "it says how to get naima when there is none")
  assert.ok((text.match(/\]\(\.\.\/\.\.\/docs\//g) ?? []).length >= 3, "it points at the docs rather than copying them")
  assert.deepEqual(brokenLinks(REPO, ["skills"]), [])
})
