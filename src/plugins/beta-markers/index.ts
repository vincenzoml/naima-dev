// What was shipped without proof, and whether the code still says so.
//
// A marker is a comment in the project's own source naming the item whose
// passing would prove the marked behaviour:
//
//   // naima:beta tests/export-keeps-alpha  export of layered files is unproven
//
// A marker is wrong in two ways. It names nothing (a problem), or it outlives
// its proof — the item it names has passed or been archived (a problem too: a
// stale marker teaches readers that the marker means nothing, and then the
// real ones stop being read).
//
// Options: { "paths": ["src"], "extensions": [".ts"], "pattern": "<regex with groups ref and what>" }

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { type Check, type Command, type Context, type Finding, type Item, type Plugin, type SummarySection, bool, isOpen, label, parse, proves } from "../../core/index.ts"

export interface Marker {
  file: string
  line: number
  ref: string
  what: string
}

export interface MarkerOptions {
  paths: string[]
  extensions: string[]
  pattern: RegExp
}

const DEFAULT_PATTERN = String.raw`^\s*(?:\/\/|#|--|;|\*)\s*naima:beta\s+(?<ref>\S+)\s*(?<what>.*)$`
const SKIP = new Set(["node_modules", ".git", "dist", "build"])

function readOptions(o: Record<string, unknown>): MarkerOptions {
  const list = (v: unknown, fallback: string[]): string[] => (Array.isArray(v) && v.every((x) => typeof x === "string") ? v : fallback)
  return {
    paths: list(o.paths, ["src"]),
    extensions: list(o.extensions, [".ts", ".tsx", ".js", ".mjs", ".py", ".rs", ".go", ".java", ".c", ".h"]),
    pattern: new RegExp(typeof o.pattern === "string" ? o.pattern : DEFAULT_PATTERN),
  }
}

function* files(dir: string, extensions: string[]): Generator<string> {
  if (!existsSync(dir)) return
  if (statSync(dir).isFile()) {
    yield dir
    return
  }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const path = join(dir, e.name)
    if (e.isDirectory()) yield* files(path, extensions)
    else if (extensions.some((x) => e.name.endsWith(x))) yield path
  }
}

export function scanMarkers(root: string, opts: MarkerOptions): Marker[] {
  const out: Marker[] = []
  for (const base of opts.paths) {
    for (const path of files(join(root, base), opts.extensions)) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((text, i) => {
          const m = text.match(opts.pattern)
          if (m?.groups?.ref) out.push({ file: relative(root, path), line: i + 1, ref: m.groups.ref, what: (m.groups.what ?? "").trim() })
        })
    }
  }
  return out
}

type State = { marker: Marker; item?: Item; state: "unproven" | "stale" | "dangling" }

function audit(ctx: Context, opts: MarkerOptions): State[] {
  return scanMarkers(ctx.root, opts).map((marker) => {
    let item: Item
    try {
      item = ctx.repo.resolve(marker.ref)
    } catch {
      return { marker, state: "dangling" }
    }
    return { marker, item, state: proves(ctx, item) || !isOpen(ctx, item) ? "stale" : "unproven" }
  })
}

export default function betaMarkers(options: Record<string, unknown> = {}): Plugin {
  const opts = readOptions(options)
  const where = (m: Marker) => `${m.file}:${m.line}`

  const check: Check = {
    name: "beta-markers",
    says: "every marker names an open item; none outlives its proof",
    run: (ctx) =>
      audit(ctx, opts)
        .filter((s) => s.state !== "unproven")
        .map((s): Finding => ({
          level: "problem",
          message:
            s.state === "dangling"
              ? `${where(s.marker)}: beta marker names "${s.marker.ref}", which is no item`
              : `${where(s.marker)}: beta marker outlived its proof — ${label(s.item as Item)} is ${s.item?.meta.status}; remove the marker`,
        })),
  }

  const command: Command = {
    name: "beta",
    says: "list what is marked as shipped without proof, and the state of each proof",
    usage: "beta [--check]",
    run(args, ctx) {
      const p = parse(args, { check: { type: "boolean" } })
      const states = audit(ctx, opts)
      for (const s of states) ctx.out(`  ${s.state.padEnd(9)} ${where(s.marker)}  ${s.marker.ref}  ${s.marker.what}`)
      const bad = states.filter((s) => s.state !== "unproven").length
      ctx.out(`${states.length} markers, ${bad} stale or dangling`)
      return bool(p, "check") && bad ? 1 : 0
    },
  }

  const summary: SummarySection = {
    name: "shipped without proof",
    render(ctx) {
      const states = audit(ctx, opts)
      if (!states.length) return []
      return [`  ${states.length} beta markers, ${states.filter((s) => s.state !== "unproven").length} stale or dangling`]
    },
  }

  return { name: "beta-markers", says: "markers in the code for behaviour shipped without proof", checks: [check], commands: [command], summary: [summary] }
}
