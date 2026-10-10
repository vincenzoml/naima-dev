// The mCRL2 verifier's LTS route and cross-check
// (specs/verifier-mcrl2-lts-route-cross-check): the steps and their
// arguments, the refusals, the LTS cache, the evidence a run records, and the
// cross-check's verdicts — on a simulated toolset, and live on the real one
// where it is installed.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { test } from "node:test"
import { createItem, type Plugin } from "../../../naima/src/core/api.ts"
import { tempProject } from "../../core/testing.ts"
import verifier, { readRun } from "../../../naima/src/plugins/verifier/index.ts"
import { mcrl2Plugin, mcrl2Verifier, type Runner, type ToolRun, workBase } from "../../../naima/src/plugins/verifier-mcrl2/index.ts"
import { type LtsRecord, publish, readEntry, sha256File } from "../../../naima/src/plugins/verifier-mcrl2/lts-cache.ts"

const FIXTURES = join(dirname(new URL(import.meta.url).pathname), "fixtures")

/** What a route says it did (§5). */
interface RouteDetails {
  route: string
  verdict?: string
  tools: Record<string, string>
  mentioned?: string[]
  hidden?: string[]
  lts?: { key: string; reused: boolean; states: number; transitions: number; generationSeconds: number }
  reduced?: { equivalence: string; states: number; transitions: number }
  counterexampleFrom?: string
}
interface CrossDetails {
  route: string
  lps: RouteDetails
  lts: RouteDetails
  agree: boolean | null
}
const said = (r: { details?: Record<string, unknown> }): RouteDetails => r.details as unknown as RouteDetails
const crossed = (r: { details?: Record<string, unknown> }): CrossDetails => r.details as unknown as CrossDetails

interface Call {
  tool: string
  args: string[]
}

type Answer = "true" | "false" | "maybe"

/**
 * A simulated mCRL2: each program writes its output file from its input, `ltsinfo` prints the sizes and the labels
 * given, and `pbessolve` answers per kind of PBES — the standard route's, the reduced LTS's, the full LTS's.
 */
function toolset(
  o: { lps?: Answer; reduced?: Answer; full?: Answer; labels?: string[]; over?: Partial<Record<string, ToolRun>> } = {},
): { run: Runner; calls: Call[] } {
  const calls: Call[] = []
  const labels = o.labels ?? ["tau", "on", "off", "idle"]
  const ok = (stdout = "", stderr = ""): ToolRun => ({ exit: 0, stdout, stderr })
  const run: Runner = (program, args) => {
    const tool = basename(program)
    if (args[0] === "--version") return ok(`${tool} mCRL2 toolset 202607.0 (Release)\n`)
    calls.push({ tool, args })
    const replaced = o.over?.[tool]
    if (replaced) return replaced
    const files = args.filter((a) => !a.startsWith("-"))
    const [input, output] = [files[0]!, files[files.length - 1]!]
    switch (tool) {
      case "mcrl22lps":
        writeFileSync(output, `LPS of ${readFileSync(input, "utf8")}`)
        return ok()
      case "lps2lts":
        writeFileSync(output, output.endsWith(".aut") ? 'des (0,1,2)\n(0,"on",1)\n' : `LTS of ${readFileSync(input, "utf8")}`)
        return ok()
      case "ltsinfo":
        return args.includes("--action-label")
          ? ok(
            "",
            `Number of states: 31.\nNumber of action labels: ${labels.length}.\nNumber of transitions: 30.\nThe action labels of this transition system: \n${
              labels.join("\n")
            }\n`,
          )
          : ok("", "Number of states: 7.\nNumber of action labels: 2 (including a tau label).\nNumber of transitions: 6.\n")
      case "ltsconvert":
        writeFileSync(output, output.endsWith(".aut") ? 'des (0,2,3)\n(0,"on",1)\n(1,"off",2)\n' : "reduced LTS")
        return ok()
      case "lps2pbes":
      case "lts2pbes":
        writeFileSync(output, "PBES")
        return ok()
      case "pbessolve": {
        const file = args.find((a) => a.startsWith("--file="))
        const evidence = args.find((a) => a.startsWith("--evidence-file="))
        if (evidence) writeFileSync(evidence.slice("--evidence-file=".length), "evidence")
        const answer = !file ? o.reduced ?? "true" : file.endsWith(".lps") ? o.lps ?? "true" : o.full ?? "false"
        return ok(`${answer}\n`)
      }
    }
    return ok()
  }
  return { run, calls }
}

/** A project folder holding the switch model, and a context whose program sits in its tracker folder. */
function project(): { root: string; model: string; ctx: never; done: () => void } {
  const root = mkdtempSync(join(tmpdir(), "naima-lts-"))
  const model = join(root, "switch.mcrl2")
  copyFileSync(join(FIXTURES, "switch.mcrl2"), model)
  const ctx = { root, program: join(root, "naima-tracker", "naima") } as never
  return { root, model, ctx, done: () => rmSync(root, { recursive: true, force: true }) }
}

const lts = { route: "lts" }
const cacheOf = (root: string): string => join(root, "naima-tracker", ".naima-work", "verifier-mcrl2", "lts")
const entries = (root: string): string[] => readdirSync(cacheOf(root)).sort()

test("LTS route: the LTS once, then per formula hide, reduce modulo dpbranching-bisim, lts2pbes and pbessolve; the run says how", async () => {
  const p = project()
  try {
    const { run, calls } = toolset()
    const r = await mcrl2Verifier({ run }).verify({ model: p.model, property: "[true* . on]mu X . ([!off]X && <true>true)", options: lts }, p.ctx)
    assert.equal(r.verdict, "holds", r.output)
    assert.deepEqual(calls.map((c) => c.tool), ["mcrl22lps", "lps2lts", "ltsinfo", "ltsconvert", "ltsinfo", "lts2pbes", "pbessolve"])
    const [, gen, , convert, , translate, solve] = calls
    assert.ok(!gen!.args.some((a) => a.startsWith("--threads")), "one thread unless asked")
    assert.deepEqual(
      convert!.args.slice(0, 2),
      ["--tau=idle", "--equivalence=dpbranching-bisim"],
      "every label's action the formula does not mention is hidden",
    )
    assert.ok(convert!.args[2]!.startsWith(cacheOf(p.root)), "the reduction reads the cached LTS")
    assert.ok(translate!.args[0]!.startsWith("--formula=") && !translate!.args.includes("--counter-example"))
    assert.deepEqual(solve!.args.filter((a) => a.startsWith("--")), ["--verbose"], "the reduced PBES is solved without evidence, verbose for its progress")
    const d = said(r)
    assert.equal(d.route, "lts")
    assert.deepEqual(d.mentioned, ["off", "on"])
    assert.deepEqual(d.hidden, ["idle"])
    assert.equal(d.lts?.reused, false)
    assert.equal(d.lts?.states, 31)
    assert.equal(d.lts?.transitions, 30)
    assert.equal(typeof d.lts?.generationSeconds, "number")
    assert.match(d.lts?.key ?? "", /^[0-9a-f]{64}$/)
    assert.deepEqual(d.reduced, { equivalence: "dpbranching-bisim", states: 7, transitions: 6 })
    assert.deepEqual(Object.keys(d.tools), ["lps2lts", "lts2pbes", "ltsconvert", "ltsinfo", "mcrl22lps", "pbessolve"])
    assert.equal(d.tools["lts2pbes"], "lts2pbes mCRL2 toolset 202607.0 (Release)")

    const threaded = toolset()
    rmSync(cacheOf(p.root), { recursive: true })
    await mcrl2Verifier({ run: threaded.run }).verify({ model: p.model, property: "[true* . on]false", options: { ...lts, threads: 4 } }, p.ctx)
    assert.deepEqual(threaded.calls[1]!.args.slice(0, 2), ["--verbose", "--threads=4"])
    for (const threads of [0, 1.5, "8"]) {
      const bad = await mcrl2Verifier({ run }).verify({ model: p.model, property: "true", options: { ...lts, threads } }, p.ctx)
      assert.equal(bad.verdict, "error")
      assert.match(bad.output, /verifierOptions\.threads must be a positive integer/)
    }
    const wrong = await mcrl2Verifier({ run }).verify({ model: p.model, property: "true", options: { route: "fast" } }, p.ctx)
    assert.equal(wrong.verdict, "error")
    assert.match(wrong.output, /verifierOptions\.route must be "lps", "lts", "cross-check", not "fast"/)
  } finally {
    p.done()
  }
})

test("LTS route: false is confirmed on the unreduced LTS, whose evidence is the counterexample; a true there is an error", async () => {
  const p = project()
  try {
    const { run, calls } = toolset({ reduced: "false", full: "false" })
    const r = await mcrl2Verifier({ run }).verify({ model: p.model, property: "[true* . on . true* . on]false", options: lts }, p.ctx)
    assert.equal(r.verdict, "violated", r.output)
    assert.deepEqual(calls.slice(7).map((c) => c.tool), ["lts2pbes", "pbessolve", "ltsconvert"])
    const [again, confirm] = calls.slice(7)
    assert.ok(again!.args.includes("--counter-example"))
    assert.equal(again!.args[again!.args.length - 2], confirm!.args.find((a) => a.startsWith("--file="))!.slice("--file=".length), "the full LTS")
    assert.ok(again!.args[again!.args.length - 2]!.startsWith(cacheOf(p.root)))
    assert.equal(r.counterexample, 'des (0,2,3)\n(0,"on",1)\n(1,"off",2)\n')
    assert.equal(said(r).counterexampleFrom, "unreduced LTS")

    const split = toolset({ reduced: "false", full: "true" })
    const e = await mcrl2Verifier({ run: split.run }).verify({ model: p.model, property: "[true* . on]false", options: lts }, p.ctx)
    assert.equal(e.verdict, "error")
    assert.match(e.output, /the reduced and the unreduced LTS disagree: false on the reduced one, true on the unreduced one/)
    assert.equal(e.counterexample, undefined)

    const odd = toolset({ reduced: "maybe" })
    assert.equal((await mcrl2Verifier({ run: odd.run }).verify({ model: p.model, property: "[true* . on]false", options: lts }, p.ctx)).verdict, "unknown")
    const slow = toolset({ over: { ltsconvert: { exit: -1, stdout: "", stderr: "", timedOut: true } } })
    const t = await mcrl2Verifier({ run: slow.run }).verify({ model: p.model, property: "[true* . on]false", options: { ...lts, timeoutSeconds: 9 } }, p.ctx)
    assert.equal(t.verdict, "unknown")
    assert.match(t.output, /ltsconvert did not finish in 9 s/)
  } finally {
    p.done()
  }
})

test("LTS route: a formula outside the fragment, or a label joining a hidden action to another, is refused as an error, never a verdict", async () => {
  const p = project()
  try {
    const { run, calls } = toolset()
    const r = await mcrl2Verifier({ run }).verify({ model: p.model, property: "[true]false", options: lts }, p.ctx)
    assert.equal(r.verdict, "error")
    assert.match(r.output, /^LTS route refused: "true" is a single step that includes τ/)
    assert.match(r.output, /Route "lps" decides this property by the standard route/)
    assert.deepEqual(calls, [], "no tool runs for a refused formula")

    const mixed = toolset({ labels: ["tau", "on|idle", "off"] })
    const m = await mcrl2Verifier({ run: mixed.run }).verify({ model: p.model, property: "[true* . on]false", options: lts }, p.ctx)
    assert.equal(m.verdict, "error")
    assert.match(m.output, /^LTS route refused: the LTS label "on\|idle" joins a hidden action to another/)
    assert.ok(!mixed.calls.some((c) => c.tool === "ltsconvert"), "nothing is reduced")

    // The simulated labels change while the model does not: each case starts from an empty cache.
    const fresh = () => rmSync(cacheOf(p.root), { recursive: true, force: true })
    const both = "[true* . on . true* . off]false"
    fresh()
    const hiddenPair = toolset({ labels: ["tau", "on|off", "idle|idle"] })
    const v = await mcrl2Verifier({ run: hiddenPair.run }).verify({ model: p.model, property: both, options: lts }, p.ctx)
    assert.equal(v.verdict, "error")
    assert.match(v.output, /the LTS label "idle\|idle" joins a hidden action to another/)
    fresh()
    const fine = toolset({ labels: ["tau", "on|off", "idle"] })
    assert.equal(
      (await mcrl2Verifier({ run: fine.run }).verify({ model: p.model, property: both, options: lts }, p.ctx)).verdict,
      "holds",
      "a multi-action of mentioned actions only",
    )
  } finally {
    p.done()
  }
})

test("LTS route: one LTS serves every property of a model at one version; a new version replaces it; a damaged one is made again", async () => {
  const p = project()
  try {
    const { run, calls } = toolset()
    const v = mcrl2Verifier({ run })
    const generations = () => calls.filter((c) => c.tool === "lps2lts").length
    const first = await v.verify({ model: p.model, property: "[true* . on]false", options: lts }, p.ctx)
    const second = await v.verify({ model: p.model, property: "<true* . off>true", options: lts }, p.ctx)
    assert.equal(generations(), 1, "the second property reuses the LTS")
    const key = (r: typeof first): string => said(r).lts!.key
    assert.equal(said(second).lts?.reused, true)
    assert.equal(key(first), key(second))
    assert.match(second.output, /LTS reused from the cache/)
    assert.deepEqual(entries(p.root), [key(first)])
    const record = JSON.parse(readFileSync(join(cacheOf(p.root), key(first), "lts.json"), "utf8")) as LtsRecord
    assert.equal(record.model, "switch.mcrl2")
    assert.equal(record.toolVersion, "mcrl22lps mCRL2 toolset 202607.0 (Release)")
    assert.deepEqual(record.labels, ["tau", "on", "off", "idle"])
    assert.ok(existsSync(join(cacheOf(p.root), key(first), "model.lps")))

    writeFileSync(p.model, readFileSync(p.model, "utf8") + "% changed\n")
    const third = await v.verify({ model: p.model, property: "[true* . on]false", options: lts }, p.ctx)
    assert.equal(generations(), 2, "a changed model has another LTS")
    assert.notEqual(key(third), key(first))
    assert.deepEqual(entries(p.root), [key(third)], "the superseded entry is removed")

    writeFileSync(join(cacheOf(p.root), key(third), "model.lts"), "damaged")
    const fourth = await v.verify({ model: p.model, property: "[true* . on]false", options: lts }, p.ctx)
    assert.equal(generations(), 3, "an LTS whose sha256 does not match is made again")
    assert.equal(said(fourth).lts?.reused, false)
    assert.deepEqual(entries(p.root), [key(third)])
    assert.equal(readEntry(cacheOf(p.root), key(third))?.record.key, key(third))
  } finally {
    p.done()
  }
})

test("LTS cache: a generation that finds its key already published uses that entry and discards its own", () => {
  const root = mkdtempSync(join(tmpdir(), "naima-lts-cache-"))
  try {
    const generated = (text: string): { folder: string; record: LtsRecord } => {
      const folder = mkdtempSync(join(root, "tmp-"))
      writeFileSync(join(folder, "model.lts"), text)
      const record: LtsRecord = {
        key: "k",
        model: "m.mcrl2",
        inputs: [],
        toolVersion: "v",
        recipe: {},
        ltsSha256: sha256File(join(folder, "model.lts")),
        states: 1,
        transitions: 0,
        labels: [],
        generationSeconds: 0,
        at: "",
      }
      return { folder, record }
    }
    const a = generated("first")
    assert.equal(publish(root, a.folder, a.record).dir, join(root, "k"))
    const b = generated("second")
    assert.equal(publish(root, b.folder, b.record).dir, join(root, "k"))
    assert.equal(readFileSync(join(root, "k", "model.lts"), "utf8"), "first", "the first published entry stays")
    assert.ok(!existsSync(b.folder), "the later generation is discarded")
    writeFileSync(join(root, "k", "model.lts"), "damaged")
    const c = generated("third")
    publish(root, c.folder, c.record)
    assert.equal(readFileSync(join(root, "k", "model.lts"), "utf8"), "third", "an entry that is not whole is replaced")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("cross-check: a verdict only when both routes reach the same one; a disagreement is an error; no verdict on either side is none", async () => {
  const p = project()
  try {
    const check = async (o: Parameters<typeof toolset>[0], property = "[true* . on]false") =>
      await mcrl2Verifier({ run: toolset(o).run }).verify({ model: p.model, property, options: { route: "cross-check" } }, p.ctx)

    const holds = await check({ lps: "true", reduced: "true" })
    assert.equal(holds.verdict, "holds")
    const d = crossed(holds)
    assert.equal(d.route, "cross-check")
    assert.equal(d.agree, true)
    assert.equal(d.lps.verdict, "holds")
    assert.equal(d.lps.route, "lps")
    assert.equal(d.lts.verdict, "holds")
    assert.deepEqual(d.lts.hidden, ["idle", "off"])
    assert.match(holds.output, /== standard route \(lps\): holds[\s\S]*== LTS route \(lts\): holds/)

    const violated = await check({ lps: "false", reduced: "false", full: "false" })
    assert.equal(violated.verdict, "violated")
    assert.equal(violated.counterexample, 'des (0,1,2)\n(0,"on",1)\n', "the standard route's counterexample")

    const disagree = await check({ lps: "true", reduced: "false", full: "false" })
    assert.equal(disagree.verdict, "error")
    assert.match(disagree.output, /^the routes disagree: the standard route says holds, the LTS route says violated/)
    assert.equal(crossed(disagree).agree, false)

    assert.equal((await check({ lps: "maybe", reduced: "true" })).verdict, "unknown")
    const refused = await check({ lps: "true" }, "[true]false")
    assert.equal(refused.verdict, "error", "a refusal on the LTS side leaves no verdict")
    assert.match(refused.output, /LTS route refused/)
    assert.equal(crossed(refused).agree, null)
  } finally {
    p.done()
  }
})

const gatesPoint: Plugin = {
  name: "gates-point",
  says: "declares gates",
  points: [{ id: "gates", noun: "gate", says: "a gate", key: (g: { name: string }) => g.name }],
}

test("LTS route through naima verify: the run record keeps the route, the sizes and the tools' versions", async () => {
  const { run } = toolset()
  const p = tempProject([verifier(), gatesPoint, mcrl2Plugin({}, run)])
  try {
    copyFileSync(join(FIXTURES, "switch.mcrl2"), join(p.root, "switch.mcrl2"))
    const prop = createItem(p.ctx, p.ctx.registry.types.get("properties")!, "every on is followed by an off", {
      verifier: "mcrl2",
      model: "switch.mcrl2",
      property: "[true* . on]mu X . ([!off]X && <true>true)",
      verifierOptions: { route: "lts" },
    })
    assert.equal(await p.run("verify", prop.slug), 0)
    const record = readRun(p.ctx.repo.resolve(prop.slug))!
    const d = said(record)
    assert.equal(d.route, "lts")
    assert.equal(d.lts?.states, 31)
    assert.deepEqual(d.reduced, { equivalence: "dpbranching-bisim", states: 7, transitions: 6 })
    assert.equal(d.tools["pbessolve"], "pbessolve mCRL2 toolset 202607.0 (Release)")
    assert.ok(existsSync(join(workBase(p.ctx.program), "lts", d.lts!.key, "model.lts")), "the cache sits in the run work folder")
  } finally {
    p.cleanup()
  }
})

/** The directory of the real mCRL2 tools, when every program the routes need is there. */
function realBin(): string | undefined {
  const which = spawnSync("sh", ["-c", "command -v mcrl22lps"], { encoding: "utf8" })
  if (which.status !== 0) return undefined
  const bin = dirname(realpathSync(which.stdout.trim()))
  return ["lps2lts", "ltsinfo", "ltsconvert", "lts2pbes", "pbessolve", "lps2pbes"].every((t) => existsSync(join(bin, t))) ? bin : undefined
}
const bin = realBin()

test("LTS route live: the real tools agree with the standard route on the fixture model, true and false", {
  skip: !bin && "mCRL2 is not installed with its LTS tools",
}, async () => {
  const p = project()
  try {
    const v = mcrl2Verifier({ bin: bin! })
    const cross = (property: string) => v.verify({ model: p.model, property, options: { route: "cross-check" } }, p.ctx)
    const holds = await cross("[true* . on]mu X . ([!off]X && <true>true)")
    assert.equal(holds.verdict, "holds", holds.output)
    assert.equal(crossed(holds).agree, true)
    const alternates = await cross("[true* . on . (!off)* . on]false")
    assert.equal(alternates.verdict, "holds", alternates.output)
    const refuted = await cross("[true* . off]false")
    assert.equal(refuted.verdict, "violated", refuted.output)
    assert.ok(refuted.counterexample?.includes("off"))
    const alone = await v.verify({ model: p.model, property: "[true* . off]false", options: lts }, p.ctx)
    assert.equal(alone.verdict, "violated", alone.output)
    assert.match(alone.counterexample ?? "", /"off"/)
    assert.equal(said(alone).lts?.reused, true)
  } finally {
    p.done()
  }
})
