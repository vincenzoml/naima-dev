// The site is a locked resource: scripts/publish-site.sh publishes only for
// the branch holding the `site` resource claim, records the claim in the
// gh-pages commit, and scripts/site-claims.ts flags a publish commit made
// without one.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { type Commit, unclaimed, verdict } from "../scripts/site-claims.ts"
import { gitIn as git, removeTemp } from "./core/testing.ts"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const holder = (branch: string, claim = "c-1", stale = false) => ({ branch, claim, claimedAt: "2026-10-02", stale })
const data = (...holders: ReturnType<typeof holder>[]) => ({ resources: [{ name: "site", declared: true, holders }] })

test("only the site's one holder may publish; the refusal names who holds it", () => {
  assert.deepEqual(verdict(data(holder("me", "abc")), "me"), { ok: true, trailer: "Resource-Claim: site abc me" })
  const other = verdict(data(holder("them", "xyz")), "me")
  assert.ok(!other.ok && /site is held by them \(claim xyz, since 2026-10-02\), not by me/.test(other.why))
  const free = verdict(data(), "me")
  assert.ok(!free.ok && /site is free: .*naima claim --resource site/.test(free.why))
  const two = verdict(data(holder("me"), holder("them")), "me")
  assert.ok(!two.ok && /more than one branch/.test(two.why))
  const none = verdict({ resources: [] }, "me")
  assert.ok(!none.ok && /not a declared resource/.test(none.why))
})

test("a gh-pages publish commit without the claim is flagged, from the first commit that carries one on", () => {
  const c = (sha: string, claimed: boolean): Commit => ({
    sha,
    message: `Site from naima-dev ${sha}${claimed ? `\n\nResource-Claim: site id-${sha} main` : ""}`,
  })
  // newest first
  assert.deepEqual(unclaimed([c("e", false), c("d", true), c("c", false), c("b", true), c("a", false)]).map((x) => x.sha), ["e", "c"])
  assert.deepEqual(unclaimed([c("b", false), c("a", false)]), [], "before any claimed commit nothing can be judged")
})

function fakeNaima(dir: string, holders: ReturnType<typeof holder>[]): string {
  const f = join(dir, "fake-naima.sh")
  writeFileSync(f, `#!/bin/sh\ncat <<'JSON'\n${JSON.stringify(data(...holders))}\nJSON\n`)
  return `sh ${f}`
}

const branchHere = () => git(ROOT, "rev-parse", "--abbrev-ref", "HEAD").trim()

test("publish-site.sh refuses, naming the holder, unless this branch holds the site claim", { skip: process.platform === "win32", timeout: 30_000 }, () => {
  const base = mkdtempSync(join(tmpdir(), "naima-site-claims-"))
  try {
    const r = spawnSync("sh", [join(ROOT, "scripts", "publish-site.sh"), "--dry-run"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, NAIMA_CLI: fakeNaima(base, [holder("someone/else", "c-9")]), NAIMA_PRODUCT_URL: join(base, "none.git") },
    })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /publish refused: site is held by someone\/else \(claim c-9/)
    assert.doesNotMatch(r.stdout, /gh-pages commit/, "nothing was built")
  } finally {
    removeTemp(base)
  }
})

test("publish-site.sh records the holder's claim in the gh-pages commit, and the audit flags a publish made without it", {
  skip: process.platform === "win32",
  timeout: 90_000,
}, () => {
  const base = mkdtempSync(join(tmpdir(), "naima-site-claims-"))
  try {
    const product = join(base, "product.git")
    git(base, "init", "-q", "--bare", product)
    const r = spawnSync("sh", [join(ROOT, "scripts", "publish-site.sh")], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, NAIMA_CLI: fakeNaima(base, [holder(branchHere(), "c-7")]), NAIMA_PRODUCT_URL: product, NAIMA_STARS: "0" },
    })
    assert.equal(r.status, 0, r.stderr)
    const message = git(product, "log", "-1", "--format=%B", "gh-pages")
    assert.match(message, new RegExp(`Resource-Claim: site c-7 ${branchHere().replace(/[/.]/g, "\\$&")}`))
    const audit = (rev: string) => spawnSync("deno", ["run", "-A", join(ROOT, "scripts", "site-claims.ts"), "audit", product, rev], { encoding: "utf8" })
    assert.equal(audit("gh-pages").status, 0)
    // a publish made by hand, without the claim, on top
    const tree = git(product, "rev-parse", "gh-pages^{tree}").trim()
    const parent = git(product, "rev-parse", "gh-pages").trim()
    const bare = git(product, "commit-tree", tree, "-p", parent, "-m", "Site from somewhere").trim()
    const flagged = audit(bare)
    assert.equal(flagged.status, 1)
    assert.match(flagged.stdout, new RegExp(`${bare.slice(0, 12)} was published without the site claim`))
  } finally {
    removeTemp(base)
  }
})
