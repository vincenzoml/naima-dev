// Four fields an item is ranked by, and no more.
//
//   priority    when:               now · next · later · parked
//   impact      who notices:        blocker · high · medium · low
//   effort      what it costs:      S · M · L · XL
//   confidence  do we understand it: measured · diagnosed · reported · unclear
//
// Effort is never derived: nothing in a report says what a fix costs, and a
// size guessed from the wording is how an XL hides inside an S. Whatever is
// derived is stamped `triagedBy: "derived"` so a human value is never
// overwritten and the share of inference stays visible.

import {
  type Command,
  type Context,
  type FieldDef,
  type Item,
  type Plugin,
  type RankTerm,
  type SummarySection,
  type View,
  bool,
  byUrgency,
  enumRank,
  isOpen,
  label,
  pairs,
  parse,
  readReadme,
  saveMeta,
  setFields,
  today,
} from "../../core/index.ts"

export const FIELDS: FieldDef[] = [
  {
    name: "priority",
    kind: "enum",
    says: "when",
    values: {
      now: "being worked on, or the next thing anyone should pick up",
      next: "this cycle, once now is clear",
      later: "real, agreed, not scheduled",
      parked: "deliberately not being done; the reason is on the page",
    },
  },
  {
    name: "impact",
    kind: "enum",
    says: "if this stays as it is, who notices",
    values: {
      blocker: "stops a release, or loses someone's work",
      high: "a newcomer would hit it and not come back",
      medium: "noticeable, worked around",
      low: "cosmetic, or only we would notice",
    },
  },
  {
    name: "effort",
    kind: "enum",
    says: "what it costs — never derived",
    values: { S: "under an hour", M: "half a day", L: "a day or two", XL: "more, or unknown until broken up" },
  },
  {
    name: "confidence",
    kind: "enum",
    says: "do we understand the item",
    values: { measured: "reproduced and measured", diagnosed: "the cause is known", reported: "as reported, not yet looked at", unclear: "nobody knows yet" },
  },
  { name: "triagedBy", kind: "enum", says: "set to derived when a tool inferred the fields", values: { derived: "inferred by naima triage derive" } },
  { name: "triagedOn", kind: "date", says: "when a person last triaged the item" },
]

const TRIAGE = ["priority", "impact", "effort", "confidence"] as const
const field = (name: string) => FIELDS.find((f) => f.name === name)

/** Confidence read off the page's own words; the only field derived from prose. */
export function confidenceFrom(body: string): string {
  const t = body.toLowerCase()
  if (/not reproduced|undiagnosed|nobody knows|\bunclear\b/.test(t)) return "unclear"
  if (/\bmeasured\b|\bverified\b|\breproduced\b|\bconfirmed\b/.test(t)) return "measured"
  if (/\bcause\b|\bmechanism\b|\bdiagnos|\bbecause\b/.test(t)) return "diagnosed"
  return "reported"
}

const rank: RankTerm[] = [
  { name: "impact", score: (i) => enumRank(field("impact"), i.meta.impact, 2.5) * 1.5 },
  { name: "priority", score: (i) => enumRank(field("priority"), i.meta.priority, 2.5) * 1.2 },
  { name: "effort", score: (i) => enumRank(field("effort"), i.meta.effort, 1.5) * 0.3 },
]

const openItems = (ctx: Context): Item[] => ctx.repo.items.filter((i) => isOpen(ctx, i))

const triage: Command = {
  name: "triage",
  says: "coverage of the four fields; set them; list what needs a human; derive what the page proves",
  usage: "triage | triage set <item> field=value... | triage missing | triage derive [--write]",
  run(args, ctx) {
    const [sub, ...rest] = args
    if (sub === "set") {
      const [ref, ...assignments] = rest
      const item = ctx.repo.resolve(ref ?? "")
      setFields(ctx, item, pairs(assignments))
      // A value set by hand is judgement; it stops being inference.
      if (item.meta.triagedBy === "derived") delete item.meta.triagedBy
      item.meta.triagedOn = today(ctx)
      saveMeta(item)
      ctx.out(`${label(item)}: ${assignments.join(" ")}`)
      return 0
    }
    if (sub === "missing") {
      const unsized = openItems(ctx).filter((i) => !i.meta.effort)
      ctx.out(`${unsized.length} open items without effort — the field only a person can set:`)
      for (const i of byUrgency(ctx, unsized)) ctx.out(`  ${label(i)}  ${i.meta.title}`)
      return 0
    }
    if (sub === "derive") {
      const write = bool(parse(rest, { write: { type: "boolean" } }), "write")
      let touched = 0
      for (const item of openItems(ctx)) {
        const m = item.meta
        const decided = m.triagedBy !== "derived" && TRIAGE.some((f) => m[f] !== undefined)
        if (decided || m.confidence) continue
        m.confidence = confidenceFrom(readReadme(item))
        m.triagedBy = "derived"
        touched++
        if (write) saveMeta(item)
      }
      ctx.out(`${touched} items ${write ? "updated" : "would change (dry run — pass --write)"}; effort is never derived`)
      return 0
    }
    if (sub !== undefined) throw new Error(`usage: naima ${this.usage}`)
    ctx.out(`  ${"type".padEnd(12)} open  ${TRIAGE.map((f) => f.padStart(10)).join("")}   derived`)
    for (const type of ctx.registry.types.values()) {
      const mine = openItems(ctx).filter((i) => i.type === type.id)
      if (!mine.length) continue
      const cells = TRIAGE.map((f) => String(mine.filter((i) => i.meta[f] !== undefined).length).padStart(10)).join("")
      ctx.out(`  ${type.id.padEnd(12)} ${String(mine.length).padStart(4)}  ${cells}   ${mine.filter((i) => i.meta.triagedBy === "derived").length}`)
    }
    return 0
  },
}

const next: View = {
  name: "next",
  says: "open items, most urgent first",
  render(args, ctx) {
    const n = Number(args[0] ?? 15)
    return byUrgency(ctx, openItems(ctx))
      .slice(0, n)
      .map((i) => `  ${[i.meta.impact, i.meta.priority, i.meta.effort].map((v) => String(v ?? "·").padEnd(8)).join("")}${label(i)}  ${i.meta.title}`)
  },
}

const top: SummarySection = {
  name: "next up",
  render(ctx) {
    const open = openItems(ctx)
    if (!open.length) return []
    const untriaged = open.filter((i) => TRIAGE.every((f) => i.meta[f] === undefined)).length
    const unsized = open.filter((i) => !i.meta.effort).length
    return [...next.render(["5"], ctx), `  (${untriaged} untriaged, ${unsized} without effort — naima triage missing)`]
  },
}

export default function triagePlugin(): Plugin {
  return {
    name: "triage",
    says: "priority, impact, effort, confidence; the urgency ranking built from them",
    fields: FIELDS,
    rank,
    commands: [triage],
    views: [next],
    summary: [top],
  }
}
