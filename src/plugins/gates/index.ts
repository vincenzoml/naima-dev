// Gates: named release or merge conditions, backed by items.
//
// A gate is the set of items that must be settled before something may
// happen. It is configured, never hard-coded:
//
//   { "name": "gates", "options": { "gates": {
//       "v1": { "title": "First public release", "says": "…", "holdsOn": "code" } } } }
//
// holdsOn "code"  (default) the gate waits for code, not for proof: an item
//                 that is fixed and owes only its proving gesture, and the
//                 gestures themselves, are owed but do not block.
// holdsOn "proof" every open item on the gate blocks it.
//
// Any plugin may contribute gates through the contract; `naima gates` lists
// them all, whoever declared them.

import {
  type Check,
  type Command,
  type Context,
  type Finding,
  type GateDef,
  type GateResult,
  type Item,
  type Plugin,
  type SummarySection,
  bool,
  groupBy,
  isEvidenceType,
  isOpen,
  label,
  linked,
  parse,
} from "../../core/index.ts"

export interface GateConfig {
  title: string
  says?: string
  holdsOn?: "code" | "proof"
}

function readOptions(options: Record<string, unknown>): Record<string, GateConfig> {
  const gates = options.gates ?? {}
  if (!gates || typeof gates !== "object" || Array.isArray(gates)) throw new Error("gates: options.gates must be an object")
  for (const [name, g] of Object.entries(gates as Record<string, unknown>)) {
    const c = g as Partial<GateConfig> | null
    if (!c || typeof c.title !== "string") throw new Error(`gates: gate "${name}" needs a title`)
    if (c.holdsOn !== undefined && c.holdsOn !== "code" && c.holdsOn !== "proof") throw new Error(`gates: gate "${name}": holdsOn is "code" or "proof"`)
  }
  return gates as Record<string, GateConfig>
}

/** Fixed but unproven, or itself a proving gesture: owed, not blocking, under holdsOn "code". */
const owesOnlyProof = (ctx: Context, item: Item): boolean => item.meta.fixedOn !== undefined || isEvidenceType(ctx, item.type)

export function evaluateGate(ctx: Context, name: string, holdsOn: "code" | "proof"): GateResult {
  const open = ctx.repo.items.filter((i) => i.meta.gate === name && isOpen(ctx, i))
  const blocking = holdsOn === "proof" ? open : open.filter((i) => !owesOnlyProof(ctx, i))
  const owed = open.filter((i) => !blocking.includes(i))
  return { holds: blocking.length === 0, blocking, owed }
}

/** Who can perform an item's proof: its own `runBy`, else that of an item verifying it. */
export function runByOf(ctx: Context, item: Item): string {
  if (typeof item.meta.runBy === "string") return item.meta.runBy
  for (const v of linked(ctx, item, "verified-by")) if (typeof v.meta.runBy === "string") return v.meta.runBy
  return ""
}

const gatesCommand: Command = {
  name: "gates",
  says: "every gate, whoever declared it, and whether it holds; --check exits 1 if one does not",
  usage: "gates [name...] [--check]",
  options: [{ name: "--check", says: "exit 1 when a listed gate does not hold" }],
  examples: ["gates", "gates first-public --check"],
  run(args, ctx) {
    const p = parse(args, { check: { type: "boolean" } })
    const wanted = p.positionals.length ? p.positionals : [...ctx.registry.gates.keys()]
    let failed = 0
    for (const name of wanted) {
      const gate = ctx.registry.gates.get(name)
      if (!gate) throw new Error(`no gate "${name}" — gates: ${[...ctx.registry.gates.keys()].join(", ") || "none configured"}`)
      const r = gate.evaluate(ctx)
      if (!r.holds) failed++
      ctx.out(`${gate.name} — ${gate.title}: ${r.holds ? "HOLDS" : `BLOCKED by ${r.blocking.length}`}${r.owed.length ? `, ${r.owed.length} owed` : ""}`)
      for (const i of r.blocking) ctx.out(`  ✗ ${label(i)}  ${i.meta.title}`)
      for (const i of r.owed) ctx.out(`  · ${label(i)}  ${i.meta.title}`)
    }
    return bool(p, "check") && failed ? 1 : 0
  },
}

const queue: Command = {
  name: "queue",
  says: "open items on a gate, split by whose hands the proof needs",
  usage: "queue [gate] [--human]",
  options: [{ name: "--human", says: "also list the items that need a person or a build, with why" }],
  examples: ["queue", "queue first-public --human"],
  run(args, ctx) {
    const p = parse(args, { human: { type: "boolean" } })
    const gate = p.positionals[0]
    const open = ctx.repo.items.filter((i) => isOpen(ctx, i) && (gate ? i.meta.gate === gate : i.meta.gate !== undefined))
    const by = groupBy(open, (i) => {
      const who = runByOf(ctx, i)
      return who === "agent" || who === "agent-hands" ? "agent" : who || "unclassified"
    })
    const noCode = open.filter((i) => !owesOnlyProof(ctx, i)).length
    ctx.out(`${gate ?? "all gates"}: ${open.length} open — ${["agent", "human", "build", "unclassified"].map((b) => `${b} ${by.get(b)?.length ?? 0}`).join(", ")}`)
    ctx.out(`  with no code yet: ${noCode}; owing only proof: ${open.length - noCode}`)
    if (bool(p, "human")) {
      for (const i of [...(by.get("human") ?? []), ...(by.get("build") ?? [])]) {
        const why = typeof i.meta.humanBecause === "string" ? i.meta.humanBecause : runByOf(ctx, i)
        ctx.out(`  ${label(i)}  ${i.meta.title}  (${why})`)
      }
    }
    return 0
  },
}

const gatedProofIsGated: Check = {
  name: "gated-proof-is-gated",
  says: "an open item that verifies an open gated item carries a gate itself",
  run(ctx) {
    const out: Finding[] = []
    for (const item of ctx.repo.items) {
      if (item.meta.gate !== undefined || !isOpen(ctx, item)) continue
      for (const target of linked(ctx, item, "verifies")) {
        if (target.meta.gate !== undefined && isOpen(ctx, target)) {
          out.push({ level: "problem", message: `${label(item)} verifies ${label(target)} (gate ${String(target.meta.gate)}) but has no gate`, item })
        }
      }
    }
    return out
  },
}

export default function gates(options: Record<string, unknown> = {}): Plugin {
  const configured = readOptions(options)
  const defs: GateDef[] = Object.entries(configured).map(([name, c]) => ({
    name,
    title: c.title,
    says: c.says ?? "",
    decides:
      (c.holdsOn ?? "code") === "code"
        ? `blocked by every open item with gate=${name} that still owes code: no fixedOn, and not itself a proving gesture. Fixed items and open proving gestures are owed, not blocking.`
        : `blocked by every open item with gate=${name}, proof included.`,
    evaluate: (ctx) => evaluateGate(ctx, name, c.holdsOn ?? "code"),
  }))
  const status: SummarySection = {
    name: "gates",
    render: (ctx) =>
      [...ctx.registry.gates.values()].map((g) => {
        const r = g.evaluate(ctx)
        return `  ${g.name.padEnd(16)} ${r.holds ? "holds" : `blocked by ${r.blocking.length}`}${r.owed.length ? `, ${r.owed.length} owed` : ""}`
      }),
  }
  return {
    name: "gates",
    says: "named release conditions backed by items",
    about:
      "A gate is the set of items that must be settled before something may happen — a release, a merge. An item joins a gate by carrying `gate: <name>`. " +
      "Gates are configured, never hard-coded, and any plugin may contribute one through the contract; `naima gates` lists them all.",
    options: [
      {
        name: "gates",
        says: 'the `gates` key of `naima/config.json`: gate name → { "title", "says", "holdsOn" }. holdsOn "code" (the default) waits for code, not proof: a fixed item that owes only its proving gesture, and the gestures themselves, are owed but do not block. holdsOn "proof": every open item on the gate blocks it.',
        default: "{}",
      },
    ],
    fields: [
      {
        name: "gate",
        kind: "enum",
        says: "the gate this item is what is waited for",
        values: Object.fromEntries(Object.entries(configured).map(([n, c]) => [n, c.title])),
      },
    ],
    gates: defs,
    rank: [{ name: "gate", score: (i) => (i.meta.gate !== undefined ? 0 : 4) }],
    checks: [gatedProofIsGated],
    commands: [gatesCommand, queue],
    summary: [status],
  }
}
