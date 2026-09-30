// The standard trackers: bugs, todos, features, tests, and the closed archive.
//
// Three words that are not synonyms:
//   fixed     the code change exists (`fixedOn` is set). Nothing is proven.
//   resolved  fixed, and proven by an item that `verifies` it and has passed.
//   closed    resolved, and moved to the archive with its proof.

import {
  type Check,
  type Command,
  type Context,
  type Finding,
  type Item,
  type Plugin,
  type SummarySection,
  isOpen,
  label,
  linked,
  moveItem,
  parse,
  proves,
  readReadme,
  saveMeta,
  today,
  typeOrThrow,
} from "../../core/index.ts"

const ABOUT = `Three words that are not synonyms:

- **fixed** — the code change exists: \`fixedOn\` is set. Nothing is proven.
- **resolved** — fixed, and proven by an item that \`verifies\` it and whose status \`proves\` (a passed test, a property that holds).
- **closed** — resolved, and moved to \`closed/\` by \`naima close\`, carrying its proof.

"How many bugs are left" means the unfixed count; \`naima bugs\` never adds the three together.

An item whose proof needs a person says why in \`humanBecause\`. Only a judgement, a reserved decision, a credential or a physical act makes something a person's: needing the running software makes it \`agent-hands\`, not \`human\`.`

export type Lifecycle = "unfixed" | "fixed" | "resolved" | "closed"

const report = (title: string): string =>
  `# ${title}\n\nWhat happened, what was seen, and what is still open.\n\n## Evidence\n\nAttach screenshots and logs in attachments/.\n`
const work = (title: string): string => `# ${title}\n\nWhat has to be done, and how it will be known to be done.\n\n- [ ] \n`
const gesture = (title: string): string =>
  `# ${title}\n\nThe gesture that proves it, step by step, and what a pass looks like.\n\n## Result\n\nWhat was seen, when, and by whom.\n`

/** Where an item stands on the fixed → resolved → closed line. */
export function lifecycle(ctx: Context, item: Item): Lifecycle {
  if (item.type === "closed") return "closed"
  if (!item.meta.fixedOn) return "unfixed"
  return linked(ctx, item, "verified-by").some((p) => proves(ctx, p)) ? "resolved" : "fixed"
}

const partialWithoutClause: Check = {
  name: "partial-says-what-is-left",
  says: "a partial item carries at least one unticked `- [ ]` clause",
  run: (ctx) =>
    ctx.repo.items
      .filter((i) => i.meta.status === "partial" && !readReadme(i).split("\n").some((l) => /^\s*[-*]\s*\[ \]/.test(l)))
      .map((i): Finding => ({ level: "note", message: `${label(i)} is partial but its page has no unticked clause`, item: i })),
}

const provenButOpen: Check = {
  name: "proven-but-open",
  says: "an open item whose proof has passed is reported so it can be closed",
  run: (ctx) =>
    ctx.repo.items
      .filter((i) => i.type !== "closed" && isOpen(ctx, i) && lifecycle(ctx, i) === "resolved")
      .map((i): Finding => ({ level: "note", message: `${label(i)} is resolved — naima close ${i.slug}`, item: i })),
}

const fixNamesGesture: Check = {
  name: "fix-names-its-gesture",
  says: "a fixed item names the gesture that would prove it",
  run: (ctx) =>
    ctx.repo.items
      .filter((i) => i.type !== "closed" && isOpen(ctx, i) && lifecycle(ctx, i) === "fixed" && linked(ctx, i, "verified-by").length === 0)
      .map((i): Finding => ({ level: "note", message: `${label(i)} is fixed, and nothing verifies it`, item: i })),
}

const closedHasProof: Check = {
  name: "closed-carries-proof",
  says: "every archived item is verified by an item that has passed",
  run: (ctx) =>
    ctx.repo.items
      .filter((i) => i.type === "closed" && !linked(ctx, i, "verified-by").some((p) => proves(ctx, p)))
      .map((i): Finding => ({ level: "problem", message: `${label(i)} is closed without a passed proof`, item: i })),
}

const humanSaysWhy: Check = {
  name: "human-says-why",
  says: "an open item whose proof needs a person (runBy human) says why in humanBecause",
  run: (ctx) =>
    ctx.repo.items
      .filter((i) => i.meta.runBy === "human" && isOpen(ctx, i) && i.meta.humanBecause === undefined)
      .map((i): Finding => ({ level: "problem", message: `${label(i)} is handed to a person without saying why — set humanBecause, or runBy if an agent can do it`, item: i })),
}

const close: Command = {
  name: "close",
  says: "archive a resolved item: fixed, and proven by an item that has passed",
  usage: "close <item>",
  examples: ["close export-drops"],
  run(args, ctx) {
    const item = ctx.repo.resolve(parse(args).positionals[0] ?? "")
    const state = lifecycle(ctx, item)
    if (state === "closed") throw new Error(`${label(item)} is already closed`)
    if (state !== "resolved") {
      throw new Error(`${label(item)} is ${state}: closing takes fixedOn and a verified-by item that has passed`)
    }
    item.meta.closedFrom = item.type
    item.meta.status = "closed"
    item.meta.closedOn = today(ctx)
    saveMeta(item)
    const moved = moveItem(ctx, item, typeOrThrow(ctx, "closed"))
    ctx.out(`closed → ${label(moved)}`)
    return 0
  },
}

const bugs: Command = {
  name: "bugs",
  says: "how many bugs have no code written, and how many are fixed but unproven",
  usage: "bugs",
  examples: ["bugs"],
  run(_args, ctx) {
    const open = ctx.repo.items.filter((i) => i.type === "bugs" && isOpen(ctx, i))
    const by = (s: Lifecycle) => open.filter((i) => lifecycle(ctx, i) === s)
    const unfixed = by("unfixed")
    ctx.out(`bugs: ${open.length} open`)
    ctx.out(`  unfixed (no code)     ${unfixed.length}`)
    ctx.out(`  fixed, not proven     ${by("fixed").length}`)
    ctx.out(`  resolved, not closed  ${by("resolved").length}`)
    for (const i of unfixed) ctx.out(`    ${label(i)}  ${i.meta.title}`)
    return 0
  },
}

const bugCounts: SummarySection = {
  name: "bugs",
  render(ctx) {
    const open = ctx.repo.items.filter((i) => i.type === "bugs" && isOpen(ctx, i))
    if (!open.length) return []
    const n = (s: Lifecycle) => open.filter((i) => lifecycle(ctx, i) === s).length
    return [`  ${n("unfixed")} unfixed · ${n("fixed")} fixed, unproven · ${n("resolved")} resolved, not closed`]
  },
}

export default function trackers(): Plugin {
  return {
    name: "trackers",
    says: "bugs, todos, features, tests, and the archive of closed bugs",
    about: ABOUT,
    types: [
      {
        id: "bugs",
        dir: "bugs",
        title: "Bugs",
        says: "something that is broken",
        statuses: {
          open: { category: "open", says: "nothing on the page has been done" },
          partial: { category: "open", says: "some of it has, and the page says what is left" },
          wontfix: { category: "done", says: "deliberately not fixed; the reason is on the page" },
        },
        initialStatus: "open",
        template: report,
      },
      {
        id: "todos",
        dir: "todos",
        title: "Todos",
        says: "work that is not a defect: a task, a decision, a tidy-up",
        statuses: {
          open: { category: "open", says: "not started" },
          partial: { category: "open", says: "started; the page says what is left" },
          done: { category: "done", says: "finished" },
          dropped: { category: "done", says: "deliberately not done; the reason is on the page" },
        },
        initialStatus: "open",
        template: work,
      },
      {
        id: "features",
        dir: "features",
        title: "Features",
        says: "what the software does, or is asked to do",
        statuses: {
          requested: { category: "open", says: "asked for; no code exists" },
          planned: { category: "open", says: "agreed and scheduled" },
          shipped: { category: "done", says: "on the trunk, with its documentation" },
          withdrawn: { category: "done", says: "decided against" },
        },
        initialStatus: "requested",
      },
      {
        id: "tests",
        dir: "tests",
        title: "Tests",
        says: "a gesture that proves something, and its result",
        statuses: {
          open: { category: "open", says: "not yet performed" },
          partial: { category: "open", says: "performed in part" },
          failed: { category: "open", says: "performed, and what it proves does not hold" },
          passed: { category: "done", proves: true, says: "performed, and it holds; the page carries the measurement" },
          withdrawn: { category: "done", says: "no longer applies: what it would prove was reversed; the page says by what" },
        },
        initialStatus: "open",
        template: gesture,
      },
      {
        id: "closed",
        dir: "closed",
        title: "Closed",
        says: "the archive: resolved items, each with its proof",
        statuses: { closed: { category: "done", says: "fixed, proven, archived" } },
        initialStatus: "closed",
        creatable: false,
      },
    ],
    fields: [
      { name: "fixedOn", kind: "date", says: "when the code landed; absent means unfixed", appliesTo: ["bugs", "todos", "closed"] },
      { name: "closedOn", kind: "date", says: "when the item was archived", appliesTo: ["closed"] },
      { name: "closedFrom", kind: "string", says: "the type the item was archived from", appliesTo: ["closed"] },
      {
        name: "runBy",
        kind: "enum",
        says: "who can perform the proving gesture — the instrument, not the effort",
        values: {
          agent: "settled by a command: a unit test, a grep, an API call",
          "agent-hands": "settled by an agent driving the running software",
          human: "needs a person: a judgement of how it looks, a physical act, a reserved decision",
          build: "needs an artefact nobody here makes: a signed build, a second machine",
        },
        appliesTo: ["tests", "bugs", "todos"],
      },
      {
        name: "humanBecause",
        kind: "enum",
        says: "why only a person can perform the proof, when runBy is human",
        values: {
          judgement: "how it looks, sounds or feels: no instrument can settle it",
          decision: "a decision reserved to the owner",
          credential: "a secret, an account or a signature only a person holds",
          physical: "a physical act or a machine only a person has at hand",
        },
        appliesTo: ["tests", "bugs", "todos"],
      },
      { name: "area", kind: "string", says: "where it lives: the surface somebody would have open while working on it" },
      { name: "kind", kind: "string", says: "the mode of work it demands: code, decision, research, writing…" },
    ],
    relations: [
      { name: "verifies", inverse: "verified-by", says: "is the gesture that proves" },
      { name: "verified-by", inverse: "verifies", says: "is proven by" },
    ],
    checks: [partialWithoutClause, provenButOpen, fixNamesGesture, closedHasProof, humanSaysWhy],
    commands: [close, bugs],
    summary: [bugCounts],
  }
}
