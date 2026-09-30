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
  fieldValue,
  isOpen,
  label,
  pairs,
  parse,
  positiveInt,
  readReadme,
  saveMeta,
  setFieldValue,
  setFields,
  today,
  usageError,
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
const enumRef = (name: string) => ({ name, kind: "enum" }) as const
const IMPACT = enumRef("impact")
const PRIORITY = enumRef("priority")
const EFFORT = enumRef("effort")
const CONFIDENCE = enumRef("confidence")
const TRIAGED_BY = enumRef("triagedBy")
const TRIAGED_ON = { name: "triagedOn", kind: "date" } as const
const field = (name: string) => FIELDS.find((f) => f.name === name)

const EVIDENCE = new Set(["measured", "verified", "reproduced", "confirmed"])
/** Any form of an evidence verb: "unable to reproduce" negates evidence as surely as "not reproduced". */
const EVIDENCE_STEM = /^(measur|verif|reproduc|confirm)/
const NEGATION = new Set(["not", "never", "no", "nobody", "cannot", "unable", "without", "can't", "couldn't", "wasn't", "weren't", "isn't", "aren't", "didn't", "doesn't", "don't", "hasn't", "haven't", "won't"])
/** How many words before an evidence verb a negation still reverses it: "could not be reproduced". */
const NEGATION_REACH = 3

/** Confidence read off the page's own words; the only field derived from prose. */
export function confidenceFrom(body: string): string {
  const t = body.toLowerCase().replace(/’/g, "'")
  const words = t.split(/[^a-z']+/).filter(Boolean)
  const negated = (i: number): boolean => words.slice(Math.max(0, i - NEGATION_REACH), i).some((w) => NEGATION.has(w))
  if (/undiagnosed|nobody knows|\bunclear\b/.test(t) || words.some((w, i) => EVIDENCE_STEM.test(w) && negated(i))) return "unclear"
  if (words.some((w) => EVIDENCE.has(w))) return "measured"
  if (/\bcause\b|\bmechanism\b|\bdiagnos|\bbecause\b/.test(t)) return "diagnosed"
  return "reported"
}

const rank: RankTerm[] = [
  { name: "impact", score: (i) => enumRank(field("impact"), fieldValue(i, IMPACT), 2.5) * 1.5 },
  { name: "priority", score: (i) => enumRank(field("priority"), fieldValue(i, PRIORITY), 2.5) * 1.2 },
  { name: "effort", score: (i) => enumRank(field("effort"), fieldValue(i, EFFORT), 1.5) * 0.3 },
]

const openItems = (ctx: Context): Item[] => ctx.repo.items.filter((i) => isOpen(ctx, i))

/** One `triage <sub>`: its own usage, so a misuse is answered with the line that fits it. */
interface Subcommand {
  usage: string
  run(args: string[], ctx: Context): number
}

const coverage: Subcommand = {
  usage: "triage",
  run(args, ctx) {
    if (args.length) throw usageError(this)
    ctx.out(`  ${"type".padEnd(12)} open  ${TRIAGE.map((f) => f.padStart(10)).join("")}   derived`)
    for (const type of ctx.registry.types.values()) {
      const mine = openItems(ctx).filter((i) => i.type === type.id)
      if (!mine.length) continue
      const cells = TRIAGE.map((f) => String(mine.filter((i) => i.meta[f] !== undefined).length).padStart(10)).join("")
      ctx.out(`  ${type.id.padEnd(12)} ${String(mine.length).padStart(4)}  ${cells}   ${mine.filter((i) => fieldValue(i, TRIAGED_BY) === "derived").length}`)
    }
    return 0
  },
}

const SUBCOMMANDS: Record<string, Subcommand> = {
  set: {
    usage: "triage set <item> field=value...",
    run(args, ctx) {
      const [ref, ...assignments] = args
      if (!ref?.trim() || !assignments.length) throw usageError(this)
      const item = ctx.repo.resolve(ref)
      setFields(ctx, item, pairs(assignments))
      // A value set by hand is judgement; it stops being inference.
      if (fieldValue(item, TRIAGED_BY) === "derived") setFieldValue(item, TRIAGED_BY, undefined)
      setFieldValue(item, TRIAGED_ON, today(ctx))
      saveMeta(item)
      ctx.out(`${label(item)}: ${assignments.join(" ")}`)
      return 0
    },
  },
  missing: {
    usage: "triage missing",
    run(args, ctx) {
      if (args.length) throw usageError(this)
      const unsized = openItems(ctx).filter((i) => !fieldValue(i, EFFORT))
      ctx.out(`${unsized.length} open items without effort — the field only a person can set:`)
      for (const i of byUrgency(ctx, unsized)) ctx.out(`  ${label(i)}  ${i.meta.title}`)
      return 0
    },
  },
  derive: {
    usage: "triage derive [--write]",
    run(args, ctx) {
      const p = parse(args, { write: { type: "boolean" } })
      if (p.positionals.length) throw usageError(this)
      const write = bool(p, "write")
      let touched = 0
      for (const item of openItems(ctx)) {
        const decided = fieldValue(item, TRIAGED_BY) !== "derived" && TRIAGE.some((f) => item.meta[f] !== undefined)
        if (decided || fieldValue(item, CONFIDENCE)) continue
        touched++
        if (write) saveMeta({ ...item, meta: { ...item.meta, [CONFIDENCE.name]: confidenceFrom(readReadme(item)), [TRIAGED_BY.name]: "derived" } })
      }
      ctx.out(`${touched} items ${write ? "updated" : "would change (dry run — pass --write)"}; effort is never derived`)
      return 0
    },
  },
}

const triage: Command = {
  name: "triage",
  says: "coverage of the four fields; set them; list what needs a human; derive what the page proves",
  usage: [coverage, ...Object.values(SUBCOMMANDS)].map((s) => s.usage).join(" | "),
  options: [{ name: "--write", says: "with derive: save the derived values instead of reporting them" }],
  examples: ["triage", "triage set export-drops impact=high priority=now effort=M", "triage missing", "triage derive --write"],
  run(args, ctx) {
    const [sub, ...rest] = args
    if (sub === undefined) return coverage.run([], ctx)
    const found = Object.hasOwn(SUBCOMMANDS, sub) ? SUBCOMMANDS[sub] : undefined
    if (!found) throw usageError(this)
    return found.run(rest, ctx)
  },
}

const next: View = {
  name: "next",
  says: "open items, most urgent first",
  render(args, ctx) {
    const n = positiveInt(args[0], 15, "next")
    return byUrgency(ctx, openItems(ctx))
      .slice(0, n)
      .map((i) => `  ${[IMPACT, PRIORITY, EFFORT].map((f) => (fieldValue(i, f) ?? "·").padEnd(8)).join("")}${label(i)}  ${i.meta.title}`)
  },
}

const top: SummarySection = {
  name: "next up",
  render(ctx) {
    const open = openItems(ctx)
    if (!open.length) return []
    const untriaged = open.filter((i) => TRIAGE.every((f) => i.meta[f] === undefined)).length
    const unsized = open.filter((i) => !fieldValue(i, EFFORT)).length
    return [...next.render(["5"], ctx), `  (${untriaged} untriaged, ${unsized} without effort — naima triage missing)`]
  },
}

export default function triagePlugin(): Plugin {
  return {
    name: "triage",
    says: "priority, impact, effort, confidence; the urgency ranking built from them",
    about:
      "Four fields rank an item, and no more. `effort` is never derived: nothing in a report says what a fix costs, and a size guessed from the wording is how an XL hides inside an S. " +
      "`triage derive` infers only `confidence`, from the page's own words — an evidence verb negated up to three words before it (\"could not be reproduced\") reads as `unclear`, never `measured` — and stamps `triagedBy: derived` so a value a person set is never overwritten. " +
      "Urgency is the sum of every plugin's rank terms, lower first; this plugin adds impact (×1.5), priority (×1.2) and effort (×0.3), each by its value's rank, unset counting as the middle.",
    fields: FIELDS,
    rank,
    commands: [triage],
    views: [next],
    summary: [top],
  }
}
