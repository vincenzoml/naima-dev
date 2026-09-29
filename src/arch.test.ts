// The dependency rule, enforced: the core imports no plugin, and a plugin
// imports only the core's public API (plus, in tests, the core's test helper)
// and its own files.

import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const SRC = dirname(fileURLToPath(import.meta.url))

function* sources(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name)
    if (e.isDirectory()) yield* sources(path)
    else if (e.name.endsWith(".ts")) yield path
  }
}

function imports(file: string): string[] {
  const text = readFileSync(file, "utf8")
  return [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => (m[1] ?? m[2]) as string)
}

const rel = (p: string) => relative(SRC, p).split("\\").join("/")
const CORE = join(SRC, "core")
const PLUGINS = join(SRC, "plugins")
const PUBLIC = new Set([join(CORE, "index.ts")])
const TEST_HELPER = join(CORE, "testing.ts")

test("the core imports nothing outside itself but node built-ins", () => {
  for (const file of sources(CORE)) {
    for (const spec of imports(file)) {
      if (spec.startsWith("node:")) continue
      assert.ok(spec.startsWith("."), `${rel(file)} imports package "${spec}" — the core has no dependencies`)
      const target = resolve(dirname(file), spec)
      assert.ok(target.startsWith(CORE + "/"), `${rel(file)} imports ${rel(target)}, outside the core`)
    }
  }
})

test("a plugin imports only the core's public API and its own files", () => {
  let checked = 0
  for (const file of sources(PLUGINS)) {
    const own = join(PLUGINS, rel(file).split("/")[1] ?? "")
    for (const spec of imports(file)) {
      checked++
      if (spec.startsWith("node:")) continue
      assert.ok(spec.startsWith("."), `${rel(file)} imports package "${spec}" — plugins have no dependencies`)
      const target = resolve(dirname(file), spec)
      if (target.startsWith(own + "/")) continue
      const allowed = PUBLIC.has(target) || (file.endsWith(".test.ts") && target === TEST_HELPER)
      assert.ok(allowed, `${rel(file)} imports ${rel(target)}; a plugin may import only core/index.ts`)
    }
  }
  assert.ok(checked > 0, "no plugin imports were found — the scanner is blind")
})

test("the scanner sees an import it must refuse", () => {
  // Guards against the rule passing because the regex matches nothing.
  const found = imports(join(SRC, "builtins.ts"))
  assert.ok(found.some((s) => s.startsWith("./plugins/")))
})
