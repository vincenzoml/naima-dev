// The site is a locked resource: scripts/publish-site.sh publishes only for
// the branch that holds the `site` resource claim (naima claim --resource
// site), and records that claim in the gh-pages commit it makes. This script
// is the two halves of that: `holder` says whether this branch holds the
// claim, printing the line the commit carries; `audit` reads a gh-pages
// history and flags every publish commit made without one, from the first
// commit that carries a claim on (an older commit predates the rule and
// cannot be judged).
//
// Standard APIs only, like the program: it runs on Deno, Node and Bun.
//
//   deno run -A scripts/site-claims.ts holder               # exit 1, naming the holder, unless this branch holds site
//   deno run -A scripts/site-claims.ts audit <git-dir> <rev> # exit 1 when a publish commit carries no claim
//
// NAIMA_CLI names the naima command to ask (default: the workshop's stable
// clone, `deno run -A naima-tracker/naima/naima.ts`), split on spaces.

import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import process from "node:process"

export const RESOURCE = "site"
/** The trailer a publish commit carries: `Resource-Claim: site <claim id> <branch>`. */
export const TRAILER = "Resource-Claim"

interface Holder {
  branch: string
  claim: string
  claimedAt: string
  note?: string
  stale: boolean
}
interface ResourcesData {
  resources: { name: string; declared: boolean; holders: Holder[] }[]
}

export type Verdict = { ok: true; trailer: string } | { ok: false; why: string }

const said = (h: Holder): string =>
  `${h.branch} (claim ${h.claim}, since ${h.claimedAt || "an unknown day"}${h.note ? `: ${h.note}` : ""}${h.stale ? "; its branch is gone: naima prune" : ""})`

/** Whether `branch` alone holds `resource` in `data` (what `naima claims --resources --json` prints), and the trailer it publishes with. */
export function verdict(data: ResourcesData, branch: string, resource = RESOURCE): Verdict {
  const r = data.resources.find((x) => x.name === resource)
  if (!r?.declared) return { ok: false, why: `${resource} is not a declared resource: declare it in plugins.coordination.options.resources` }
  if (!r.holders.length) return { ok: false, why: `${resource} is free: no branch holds it — naima claim --resource ${resource} on ${branch}, then publish` }
  const mine = r.holders.find((h) => h.branch === branch)
  if (!mine) return { ok: false, why: `${resource} is held by ${r.holders.map(said).join("; ")}, not by ${branch}: only its holder publishes` }
  if (r.holders.length > 1) {
    return { ok: false, why: `${resource} is held by more than one branch, ${r.holders.map(said).join("; ")}: all but one release it first` }
  }
  return { ok: true, trailer: `${TRAILER}: ${resource} ${mine.claim} ${branch}` }
}

export interface Commit {
  sha: string
  message: string
}

const carries = (c: Commit, resource = RESOURCE): boolean =>
  c.message.split("\n").some((l) => l.startsWith(`${TRAILER}: ${resource} `) && l.trim().split(/\s+/).length >= 4)

/**
 * The publish commits, newest first, made without a claim: every one newer
 * than the oldest commit carrying the trailer that does not carry it. Before
 * that commit, nothing can be judged, so nothing is flagged.
 */
export function unclaimed(commits: Commit[], resource = RESOURCE): Commit[] {
  let oldest = -1
  commits.forEach((c, i) => {
    if (carries(c, resource)) oldest = i
  })
  return oldest < 0 ? [] : commits.slice(0, oldest).filter((c) => !carries(c, resource))
}

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function run(cmd: string, args: string[], cwd = ROOT): string {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}: ${(r.stderr || r.stdout || "").trim() || `exit ${r.status}`}`)
  return r.stdout
}

function holder(): number {
  const [cmd = "deno", ...rest] = (process.env["NAIMA_CLI"] || `deno run -A ${join(ROOT, "naima-tracker", "naima", "naima.ts")}`).split(" ")
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim()
  const v = verdict(JSON.parse(run(cmd, [...rest, "claims", "--resources", "--json"])) as ResourcesData, branch)
  if (!v.ok) {
    process.stderr.write(`publish refused: ${v.why}\n`)
    return 1
  }
  process.stdout.write(`${v.trailer}\n`)
  return 0
}

function audit(gitDir: string, rev: string): number {
  const log = run("git", ["-C", gitDir, "log", "--format=%H%x00%B%x1e", rev])
  const commits = log.split("\x1e").map((e) => e.trim()).filter(Boolean).map((e) => {
    const [sha = "", message = ""] = e.split("\0")
    return { sha, message }
  })
  const flagged = unclaimed(commits)
  for (const c of flagged) process.stdout.write(`gh-pages ${c.sha.slice(0, 12)} was published without the ${RESOURCE} claim: ${c.message.split("\n")[0]}\n`)
  return flagged.length ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [what, ...args] = process.argv.slice(2)
  try {
    if (what === "holder") process.exit(holder())
    else if (what === "audit" && args.length === 2) process.exit(audit(args[0] as string, args[1] as string))
    else {
      process.stderr.write("usage: site-claims.ts holder | site-claims.ts audit <git-dir> <rev>\n")
      process.exit(2)
    }
  } catch (e) {
    process.stderr.write(`site-claims: ${(e as Error).message}\n`)
    process.exit(1)
  }
}
