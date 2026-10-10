// Naima's own long work reports its progress: the core's reporter, naima
// verify on the mCRL2 verifier, metrics run and tools install — against
// specs/progress-long-work-says-how-far, §6. No tool runs for real: mCRL2's
// output is replayed and the download is served from 127.0.0.1.

import assert from "node:assert/strict"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { createItem, type Plugin, type Progress, progressReporter, readProgressLine } from "../../../naima/src/core/api.ts"
import verifier from "../../../naima/src/plugins/verifier/index.ts"
import { mcrl2Plugin, mcrl2Verifier, type Runner, type ToolRun } from "../../../naima/src/plugins/verifier-mcrl2/index.ts"
import metrics from "../../../naima/src/plugins/metrics/index.ts"
import { download } from "../../../naima/src/plugins/tools/install.ts"
import { tempProject } from "../../core/testing.ts"

const FIXTURES = join(dirname(dirname(fileURLToPath(import.meta.url))), "verifier-mcrl2", "fixtures")
const replayed = JSON.parse(readFileSync(join(FIXTURES, "tools.json"), "utf8")) as Record<string, ToolRun>
const model = join(FIXTURES, "switch.mcrl2")

/** A progress that records every call. */
function recorder(): { progress: Progress; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    progress: {
      overall: (d, t, u) => calls.push(`overall ${d}/${t} ${u}`),
      stage: (n, t, u) => calls.push(`stage ${n}${t !== undefined ? ` /${t}` : ""}${u ? ` ${u}` : ""}`),
      at: (d) => calls.push(`at ${d}`),
      note: (n) => calls.push(`note ${n}`),
      end: () => calls.push("end"),
    },
  }
}

/** Run `fn` with $NAIMA_RUN_PROGRESS naming a fresh file: what it holds afterwards, and every line ever written there. */
async function insideRun(fn: () => Promise<unknown>): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "naima-progress-"))
  const file = join(dir, "progress")
  const was = process.env["NAIMA_RUN_PROGRESS"]
  process.env["NAIMA_RUN_PROGRESS"] = file
  try {
    await fn()
    return readFileSync(file, "utf8")
  } finally {
    if (was === undefined) delete process.env["NAIMA_RUN_PROGRESS"]
    else process.env["NAIMA_RUN_PROGRESS"] = was
    rmSync(dir, { recursive: true, force: true })
  }
}

test("the reporter: silent for its first 2 seconds on standard error, then a change every 2 seconds and a beat every 5, with rate and ETA", () => {
  let now = 0
  const lines: string[] = []
  const p = progressReporter((l) => lines.push(l), { now: () => now, beat: false })
  p.stage("download", 1000, "bytes")
  p.at(100)
  now = 1_900
  p.at(300)
  assert.deepEqual(lines, [], "short work stays quiet")
  now = 2_000
  p.at(400)
  assert.deepEqual(lines, ["progress: download: 400/1,000 bytes (40%) · 200/s · ETA 3s · 2s in this stage"])
  now = 3_000
  p.at(500)
  assert.equal(lines.length, 1, "a change is printed at most every 2 seconds")
  now = 4_000
  p.at(600)
  assert.equal(lines.length, 2)
  now = 9_000
  p.note("")
  assert.equal(lines.length, 3, "said again after 5 seconds without a change")
  assert.match(lines[2]!, /^progress: download: 600\/1,000 bytes \(60%\) · .* · 9s in this stage$/)
  p.stage("unpack")
  assert.equal(lines[3], "progress: unpack · 0s in this stage", "a new stage is printed at once")
  p.end()
  now = 20_000
  p.at(1)
  assert.equal(lines.length, 4, "nothing after the end")
})

test("the reporter inside a run: one structured line in $NAIMA_RUN_PROGRESS, rewritten at each stage and at most once a second, nothing on standard error", () => {
  const dir = mkdtempSync(join(tmpdir(), "naima-progress-"))
  const file = join(dir, "progress")
  try {
    let now = 0
    const lines: string[] = []
    const p = progressReporter((l) => lines.push(l), { file, now: () => now, beat: false })
    p.overall(0, 3, "properties")
    p.stage("p1: lps2lts", undefined, "states")
    assert.deepEqual(readProgressLine(readFileSync(file, "utf8")), { stage: "p1: lps2lts", unit: "states", overall: { done: 0, total: 3, unit: "properties" } })
    now = 500
    p.at(1200)
    assert.equal(readProgressLine(readFileSync(file, "utf8"))!.done, undefined, "within a second, not rewritten")
    now = 1_000
    p.at(2400)
    assert.equal(readProgressLine(readFileSync(file, "utf8"))!.done, 2400)
    now = 7_000
    p.note("")
    assert.equal(readProgressLine(readFileSync(file, "utf8"))!.done, 2400, "said again after 5 seconds")
    assert.deepEqual(lines, [])
    p.end()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** mCRL2 replayed: `pbessolve` and `lps2lts` print their counting lines, separated by carriage returns, among others. */
function counting(): { run: Runner; calls: { tool: string; args: string[] }[] } {
  const calls: { tool: string; args: string[] }[] = []
  const run: Runner = (program, args, _cwd, _timeout, onStderr) => {
    const tool = basename(program)
    if (args[0] === "--version") return replayed["version"]!
    calls.push({ tool, args })
    if (tool === "pbessolve") {
      const stderr =
        "Generating parity game...\nGenerated 1000 BES equations (95.69% explored)\rGenerated 2000 BES equations (96.95% explored)\rGenerated 2500 BES equations\nSolving parity game...\n"
      onStderr?.(stderr.slice(0, 40))
      onStderr?.(stderr.slice(40))
      return { exit: 0, stdout: "true\n", stderr }
    }
    return replayed[tool] ?? { exit: 0, stdout: "", stderr: "" }
  }
  return { run, calls }
}

test("mCRL2: each tool is a stage; pbessolve and lps2lts run --verbose, their counts read as they come and left out of the output", async () => {
  const { run, calls } = counting()
  const r = recorder()
  const v = mcrl2Verifier({ run })
  const result = await v.verify({ model, property: "[true*]<true>true", options: {}, progress: r.progress }, { root: FIXTURES } as never)
  assert.equal(result.verdict, "holds")
  assert.deepEqual(r.calls, [
    "stage mcrl22lps",
    "stage lps2pbes",
    "stage pbessolve BES equations",
    "note Generating parity game...",
    "at 1000",
    "at 2000",
    "at 2500",
    "note Solving parity game...",
  ])
  assert.deepEqual(calls.map((c) => [c.tool, c.args[0] === "--verbose"]), [["mcrl22lps", false], ["lps2pbes", false], ["pbessolve", true]])
  assert.match(result.output, /Generating parity game\.\.\.\nSolving parity game\.\.\./)
  assert.doesNotMatch(result.output, /Generated \d+ BES equations/)
})

const gatesPoint: Plugin = {
  name: "gates-point",
  says: "declares gates",
  points: [{ id: "gates", noun: "gate", says: "a gate", key: (g: { name: string }) => g.name }],
}

test("naima verify inside a run: the properties done of those asked, and the property's tools as its stages", async () => {
  const p = tempProject([verifier(), gatesPoint, mcrl2Plugin({}, counting().run)])
  try {
    copyFileSync(model, join(p.root, "switch.mcrl2"))
    const props = ["one", "two"].map((t) =>
      createItem(p.ctx, p.ctx.registry.types.get("properties")!, `the switch never deadlocks ${t}`, {
        verifier: "mcrl2",
        model: "switch.mcrl2",
        property: "[true*]<true>true",
      })
    )
    const last = await insideRun(() => p.run("verify", ...props.map((x) => x.slug)))
    const line = readProgressLine(last)!
    assert.deepEqual(line.overall, { done: 2, total: 2, unit: "properties" })
    assert.match(line.stage ?? "", /^properties\/switch-never-deadlocks-two: pbessolve$/)
    assert.equal(line.unit, "BES equations")
  } finally {
    p.cleanup()
  }
})

test("naima metrics run inside a run: the metrics taken of those asked", async () => {
  const p = tempProject([metrics({ metrics: { a: { run: ["git", "--version"] }, b: { run: ["git", "--version"] } } })], { git: true })
  try {
    const last = await insideRun(() => p.run("metrics", "run"))
    const line = readProgressLine(last)!
    assert.deepEqual(line.overall, { done: 2, total: 2, unit: "metrics" })
    assert.equal(line.stage, "b")
  } finally {
    p.cleanup()
  }
})

test("naima tools install: the download reports the bytes received of the declared size", async () => {
  const dir = mkdtempSync(join(tmpdir(), "naima-download-"))
  const body = Buffer.alloc(300_000, 7)
  const server = createServer((_req, res) => {
    res.write(body.subarray(0, 100_000))
    setTimeout(() => res.end(body.subarray(100_000)), 20)
  })
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  try {
    const { port } = server.address() as AddressInfo
    const seen: number[] = []
    const got = await download(`http://127.0.0.1:${port}/x`, join(dir, "x"), body.length, (n) => seen.push(n))
    assert.equal(got.bytes, body.length)
    assert.ok(seen.length >= 2, "more than one report")
    assert.deepEqual([...seen].sort((a, b) => a - b), seen, "the count only grows")
    assert.equal(seen.at(-1), body.length)
    writeFileSync(join(dir, "done"), "")
  } finally {
    await new Promise<void>((done) => server.close(() => done()))
    rmSync(dir, { recursive: true, force: true })
  }
})
