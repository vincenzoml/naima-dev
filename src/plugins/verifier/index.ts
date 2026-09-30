// Properties proven by formal-methods tools, tracked like any other item.
//
// A property item names a verifier (an adapter any plugin can contribute), a
// model file and a property. `naima verify` runs the adapter and attaches the
// run — verdict, output, counterexample, and the hash of the model it ran
// on — to the item. A property that `holds` is evidence exactly as a passed
// test is: it can `verify` a bug and close it.
//
// A verdict is only as good as the model it was reached on, so `check` fails
// when a property claims to hold and the model has changed since its run.

import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"
import {
  ATTACHMENTS,
  type Check,
  type Command,
  type Context,
  type Finding,
  type GateDef,
  type Item,
  type Plugin,
  type Verdict,
  type VerifyResult,
  bool,
  label,
  parse,
  saveMeta,
  usageError,
} from "../../core/index.ts"
import { exampleRegex } from "./adapters/example-regex.ts"

export const TYPE = "properties"

export interface RunRecord {
  verifier: string
  model: string
  modelSha256: string
  property: string
  /** The sha256 of the item's `verifierOptions`, keys sorted; absent in runs recorded before it was kept, meaning none. */
  optionsSha256?: string
  verdict: Verdict
  output: string
  counterexample?: string
  at: string
}

const STATUS: Record<Verdict, string> = { holds: "holds", violated: "violated", error: "error", unknown: "error" }

const VERDICTS: readonly Verdict[] = ["holds", "violated", "error", "unknown"]

/** An adapter's answer held to the contract: anything outside it is an `error`, with an output that says why. */
export function inContract(id: string, result: unknown): VerifyResult {
  if (!result || typeof result !== "object") return { verdict: "error", output: `adapter "${id}" returned ${String(result)}, not a result` }
  const { verdict, output, counterexample } = result as Record<string, unknown>
  if (!VERDICTS.includes(verdict as Verdict)) {
    return { verdict: "error", output: `adapter "${id}" returned verdict ${JSON.stringify(verdict)}, outside the contract (${VERDICTS.join(", ")})${typeof output === "string" ? `: ${output}` : ""}` }
  }
  if (typeof output !== "string") return { verdict: "error", output: `adapter "${id}" returned verdict ${String(verdict)} with no string output` }
  return { verdict: verdict as Verdict, output, ...(typeof counterexample === "string" ? { counterexample } : {}) }
}

const sha256 = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex")

/** JSON with every object's keys sorted: the same options always hash the same. */
const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v) ?? "null"

/** The options a property is verified with: its `verifierOptions` object, or none. */
const optionsOf = (item: Item): Record<string, unknown> => {
  const raw = item.meta.verifierOptions
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}
const optionsHash = (options: Record<string, unknown>): string => createHash("sha256").update(canonical(options)).digest("hex")

const template = (title: string): string =>
  `# ${title}\n\nThe property in words, and why it matters.\n\nSet \`verifier\`, \`model\` (a path from the project root) and \`property\` in meta.json, then \`naima verify\`.\n`

/** A run record read back from disk, checked field by field; the reason when it is not one. */
function asRun(value: unknown): RunRecord | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "not a JSON object"
  const r = value as Record<string, unknown>
  const missing = ["verifier", "model", "modelSha256", "property", "output", "at"].filter((k) => typeof r[k] !== "string")
  if (missing.length) return `${missing.join(", ")} missing or not text`
  if (!VERDICTS.includes(r.verdict as Verdict)) return `verdict ${JSON.stringify(r.verdict)} is not one of ${VERDICTS.join(", ")}`
  for (const k of ["optionsSha256", "counterexample"]) if (r[k] !== undefined && typeof r[k] !== "string") return `${k} is not text`
  return r as unknown as RunRecord
}

/** `lastRun` names a file directly in the item's attachments/, never a path out of it. */
const isAttachmentName = (name: string): boolean => /^[^/\\]+$/.test(name) && name !== "." && name !== ".."

/** The item's last run: the record, why it cannot be trusted, or null when there is none. */
export function loadRun(item: Item): { run: RunRecord } | { problem: string } | null {
  const name = item.meta.lastRun
  if (typeof name !== "string") return null
  if (!isAttachmentName(name)) return { problem: `lastRun ${JSON.stringify(name)} is not a file name in ${ATTACHMENTS}/` }
  const path = join(item.dir, ATTACHMENTS, name)
  if (!existsSync(path)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"))
  } catch (e) {
    return { problem: `its run record ${ATTACHMENTS}/${name} is malformed: ${e instanceof Error ? e.message : String(e)}` }
  }
  const run = asRun(parsed)
  return typeof run === "string" ? { problem: `its run record ${ATTACHMENTS}/${name} is malformed: ${run}` } : { run }
}

/** The item's last run, when there is a trustworthy one. */
export function readRun(item: Item): RunRecord | null {
  const r = loadRun(item)
  return r && "run" in r ? r.run : null
}

/** The model's absolute path, when `model` names a file inside the project; null for one that escapes it. */
export function modelPath(root: string, model: string): string | null {
  if (isAbsolute(model)) return null
  const abs = resolve(root, model)
  const rel = relative(root, abs)
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? null : abs
}

/** Run one property's verifier and attach the result. Returns the verdict. */
export async function verifyItem(ctx: Context, item: Item): Promise<Verdict> {
  const { verifier: id, model, property } = item.meta
  if (typeof id !== "string" || typeof model !== "string" || typeof property !== "string") {
    throw new Error(`${label(item)}: set verifier, model and property first`)
  }
  const verifier = ctx.registry.verifiers.get(id)
  if (!verifier) throw new Error(`${label(item)}: no verifier "${id}" — verifiers: ${[...ctx.registry.verifiers.keys()].join(", ")}`)
  const path = modelPath(ctx.root, model)
  if (!path) throw new Error(`${label(item)}: model ${model} is outside the project — model is a path from the project root`)
  if (!existsSync(path)) throw new Error(`${label(item)}: model ${model} does not exist`)
  const options = optionsOf(item)
  const hash = sha256(path)
  let result: VerifyResult
  try {
    result = inContract(id, await verifier.verify({ model: path, property, options }, ctx))
  } catch (e) {
    result = { verdict: "error", output: e instanceof Error ? e.message : String(e) }
  }
  const at = ctx.now().toISOString()
  const stamp = at.replace(/[:.]/g, "-")
  const record: RunRecord = { verifier: id, model, modelSha256: hash, property, optionsSha256: optionsHash(options), verdict: result.verdict, output: result.output, at, ...(result.counterexample !== undefined ? { counterexample: result.counterexample } : {}) }
  const name = `run-${stamp}.json`
  writeFileSync(join(item.dir, ATTACHMENTS, name), JSON.stringify(record, null, 2) + "\n")
  if (result.counterexample !== undefined) writeFileSync(join(item.dir, ATTACHMENTS, `counterexample-${stamp}.txt`), result.counterexample + "\n")
  item.meta.status = STATUS[result.verdict]
  item.meta.lastRun = name
  saveMeta(item)
  return result.verdict
}

const properties = (ctx: Context): Item[] => ctx.repo.items.filter((i) => i.type === TYPE)

const verify: Command = {
  name: "verify",
  says: "run the verifier of properties and attach each run as evidence",
  usage: "verify <property>... | verify --all",
  options: [{ name: "--all", says: "every property item" }],
  examples: ["verify no-deadlock", "verify --all"],
  async run(args, ctx) {
    const p = parse(args, { all: { type: "boolean" } })
    const items = bool(p, "all") ? properties(ctx) : p.positionals.map((r) => ctx.repo.resolve(r))
    if (!items.length) throw usageError(this)
    let failing = 0
    for (const item of items) {
      if (item.type !== TYPE) throw new Error(`${label(item)} is not a property`)
      const verdict = await verifyItem(ctx, item)
      if (verdict !== "holds") failing++
      ctx.out(`${verdict.padEnd(9)} ${label(item)}  ${item.meta.title}`)
    }
    return failing ? 1 : 0
  },
}

const verifiers: Command = {
  name: "verifiers",
  says: "list the verifier adapters every plugin contributes",
  usage: "verifiers",
  examples: ["verifiers"],
  run(_args, ctx) {
    for (const v of ctx.registry.verifiers.values()) ctx.out(`  ${v.id.padEnd(16)} ${v.says}`)
    return 0
  },
}

const evidence: Check = {
  name: "property-evidence",
  says: "a property names a known verifier and an existing model; one that holds carries a run of its current property, verifier, model and options, on the model as it is now",
  run(ctx) {
    const out: Finding[] = []
    const problem = (item: Item, message: string) => out.push({ level: "problem", message: `${label(item)}: ${message}`, item })
    for (const item of properties(ctx)) {
      const { verifier, model } = item.meta
      if (typeof verifier === "string" && !ctx.registry.verifiers.has(verifier)) problem(item, `verifier "${verifier}" is not loaded`)
      const path = typeof model === "string" ? modelPath(ctx.root, model) : null
      if (typeof model === "string" && !path) problem(item, `model ${model} is outside the project — model is a path from the project root`)
      else if (path && !existsSync(path)) problem(item, `model ${String(model)} does not exist`)
      const loaded = loadRun(item)
      if (loaded && "problem" in loaded && !loaded.problem.startsWith("its run record")) problem(item, loaded.problem)
      if (item.meta.status !== "holds") continue
      if (loaded && "problem" in loaded && loaded.problem.startsWith("its run record")) {
        problem(item, `holds, but ${loaded.problem}`)
        continue
      }
      const run = loaded && "run" in loaded ? loaded.run : null
      if (!run) problem(item, "holds, but carries no run")
      else if (run.verdict !== "holds") problem(item, `holds, but its last run says ${run.verdict}`)
      else {
        // The verdict is evidence only for exactly what was run: the property, the adapter, the model and its options.
        const again = " — run naima verify again"
        const { property } = item.meta
        if (run.property !== property) problem(item, `holds for property ${JSON.stringify(run.property)}, not ${JSON.stringify(property)}${again}`)
        if (run.verifier !== verifier) problem(item, `holds by verifier ${JSON.stringify(run.verifier)}, not ${JSON.stringify(verifier)}${again}`)
        if (run.model !== model) problem(item, `holds on model ${run.model}, not ${String(model)}${again}`)
        else if (path && existsSync(path) && run.modelSha256 !== sha256(path)) {
          problem(item, `holds on a model that has changed since${again}`)
        }
        if ((run.optionsSha256 ?? optionsHash({})) !== optionsHash(optionsOf(item))) problem(item, `holds with other verifierOptions than it has now${again}`)
      }
    }
    return out
  },
}

const allHold: GateDef = {
  name: "properties",
  title: "Every property holds",
  says: "no property item is open, violated or in error",
  decides: "blocked by every properties item whose status is not holds; nothing is owed.",
  evaluate(ctx) {
    const blocking = properties(ctx).filter((i) => i.meta.status !== "holds")
    return { holds: blocking.length === 0, blocking, owed: [] }
  },
}

export default function verifier(): Plugin {
  return {
    name: "verifier",
    says: "properties checked by formal-methods tools, with each run attached as evidence",
    about:
      "A `properties` item names a `verifier` (an adapter any plugin can contribute), a `model` file (a path from the project root) and a `property` in the verifier's own language. " +
      "`naima verify` runs the adapter and attaches the run — verdict, output, the model's sha256 — and the counterexample as its own file, then sets the status from the verdict. " +
      "A property that holds is evidence exactly as a passed test is: it can `verify` a bug and close it. A verdict is only as good as what it was reached on, so `naima check` fails when a property claims to hold and its property, verifier, model path, `verifierOptions` or model contents have changed since the run. " +
      "The shipped adapter, `example-regex`, is a stand-in that shows the shape of a real one.",
    types: [
      {
        id: TYPE,
        dir: "properties",
        title: "Properties",
        says: "a property of the software, proven or refuted by a verifier",
        statuses: {
          open: { category: "open", says: "not yet verified" },
          holds: { category: "done", proves: true, says: "the last run on the current model holds" },
          violated: { category: "open", says: "the last run found a counterexample" },
          error: { category: "open", says: "the last run could not reach a verdict" },
        },
        initialStatus: "open",
        template,
      },
    ],
    fields: [
      { name: "verifier", kind: "string", says: "the adapter that checks it", appliesTo: [TYPE] },
      { name: "model", kind: "string", says: "the model or specification file, from the project root, and inside it", appliesTo: [TYPE] },
      { name: "property", kind: "string", says: "the property, in the verifier's own language", appliesTo: [TYPE] },
      { name: "lastRun", kind: "string", says: "the attachment holding the last run: a file name in the item's attachments/", appliesTo: [TYPE] },
      { name: "verifierOptions", kind: "object", says: "options handed to the verifier with the model and the property, as a JSON object", appliesTo: [TYPE] },
    ],
    verifiers: [exampleRegex],
    gates: [allHold],
    checks: [evidence],
    commands: [verify, verifiers],
  }
}
