// Progress through naima run: the shipped rule, the progress line read with
// its rate and ETA, stale and --no-progress runs, and the check
// progress-declared — against specs/progress-long-work-says-how-far, §1–5
// and §7. Every run here has a budget and every wait a timeout.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import longWork, { listLine, PROGRESS_RULE, progressText } from "../../../naima/src/plugins/long-work/index.ts"
import { commandReports, findRuns, noProgressOf, shellWords } from "../../../naima/src/plugins/long-work/declared.ts"
import { progressOf, type RunStatus, type RunView, sampleProgress, SUBCOMMANDS } from "../../../naima/src/plugins/long-work/records.ts"
import rules from "../../../naima/src/plugins/rules/index.ts"
import trackers from "../../../naima/src/plugins/trackers/index.ts"
import type { Check, Plugin } from "../../../naima/src/core/api.ts"
import { removeTemp, type TempProject, tempProject } from "../../core/testing.ts"

const REPO = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
const CLI = join(REPO, "naima", "src", "cli.ts")
const hasDeno = spawnSync("deno", ["--version"]).status === 0
const posix = process.platform !== "win32"

/** A plugin with a command declared long: `reports` when it says how it reports, `{}` when it says nothing. */
const renderer = (long: unknown): Plugin => ({
  name: "renderer",
  says: "renders",
  commands: [{ name: "render", says: "render frames", usage: "render", long: long as never, run: () => 0 }],
})

const project = (extra: Plugin[] = [], ruleOptions: Record<string, unknown> = {}): TempProject =>
  tempProject([trackers(), rules(ruleOptions), longWork(), ...extra], { git: true })
const runs = (p: TempProject): string => join(p.root, "naima-tracker", ".runs")
const out = (p: TempProject): string => p.output.join("\n")

async function inside<T>(p: TempProject, fn: () => Promise<T>): Promise<T> {
  const was = process.cwd()
  process.chdir(p.root)
  try {
    return await fn()
  } finally {
    process.chdir(was)
  }
}

async function statusOf(p: TempProject, name: string): Promise<RunView> {
  p.output.length = 0
  await p.run("run", "status", name, "--json")
  return JSON.parse(out(p)) as RunView
}

/** A record written by hand, as a supervisor alive (`heartbeat` now) would leave it; `log` and `progress` with their ages. */
function record(p: TempProject, name: string, o: { startedAgoMs: number; staleMs: number; noProgress?: string; logAgoMs?: number; progress?: string }) {
  const dir = join(runs(p), name)
  mkdirSync(dir, { recursive: true })
  const started = Date.now() - o.startedAgoMs
  const spec = {
    name,
    command: ["x"],
    shell: true,
    cwd: p.root,
    budgetTimeMs: 7_200_000,
    creates: [],
    everyMs: 1000,
    staleMs: o.staleMs,
    guardTracked: false,
    started: new Date(started).toISOString(),
    ...(o.noProgress !== undefined ? { noProgress: o.noProgress } : {}),
  }
  writeFileSync(join(dir, "run.json"), JSON.stringify(spec))
  writeFileSync(join(dir, "status.json"), JSON.stringify({ state: "running", supervisorPid: 1, pid: 1, heartbeat: new Date().toISOString(), elapsedMs: 0 }))
  writeFileSync(join(dir, "log"), "compiling\nlinking stage 2\n")
  const logAt = new Date(Date.now() - (o.logAgoMs ?? 0))
  utimesSync(join(dir, "log"), logAt, logAt)
  if (o.progress !== undefined) writeFileSync(join(dir, "progress"), o.progress + "\n")
}

test("the shipped progress rule is listed, for everyone, as a must enforced by progress-declared, with its acknowledgement; a project can retire it", async () => {
  const p = project()
  try {
    for (const audience of ["agents", "people"]) {
      p.output.length = 0
      await p.run("rules", "--audience", audience)
      assert.ok(
        out(p).includes(
          `MUST · everyone · ${PROGRESS_RULE.title} (long-work/long-work-reports-progress, shipped by long-work, enforced by progress-declared, ack "Progress mode on")`,
        ),
        audience,
      )
      assert.match(out(p), /Acknowledge: .*Progress mode on/)
    }
    assert.match(PROGRESS_RULE.text, /--no-progress/)
    assert.match(PROGRESS_RULE.text, /elapsed time, the stage, and the tool's own log lines/)
  } finally {
    p.cleanup()
  }
  const retired = project([], { retire: ["long-work-reports-progress"] })
  try {
    await retired.run("rules", "--audience", "people")
    assert.doesNotMatch(out(retired), /long-work-reports-progress/)
  } finally {
    retired.cleanup()
  }
})

test("a progress line is read with its rate and ETA from the stage's first sample; the overall count likewise; free text stays text", () => {
  const t0 = Date.parse("2026-10-10T10:00:00Z")
  const first = '{"stage":"render","done":10,"total":110,"unit":"frames","overall":{"done":1,"total":5,"unit":"scenes"}}'
  let kept = sampleProgress(first, t0, {})
  assert.deepEqual(kept.progressFrom, { stage: "render", unit: "frames", total: 110, done: 10, at: t0 })
  assert.deepEqual(kept.overallFrom, { unit: "scenes", total: 5, done: 1, at: t0 })
  const later = '{"stage":"render","done":30,"total":110,"unit":"frames","overall":{"done":2,"total":5,"unit":"scenes"},"note":"scene 2"}'
  kept = sampleProgress(later, t0 + 10_000, kept)
  assert.equal(kept.progressFrom!.done, 10, "the same stage keeps its first sample")
  const v = progressOf(later, t0 + 10_000, kept as RunStatus, t0 + 10_000)
  assert.equal(v.rate, 2)
  assert.equal(v.etaMs, 40_000)
  assert.equal(v.overallRate, 0.1)
  assert.equal(v.overallEtaMs, 30_000)
  assert.equal(
    progressText(v),
    "2/5 scenes (40%) · 6/min · ETA 30s — render: 30/110 frames (27%) · 2/s · ETA 40s — scene 2",
  )
  const aged = progressOf(later, t0 + 10_000, kept as RunStatus, t0 + 25_000)
  assert.equal(aged.etaMs, 25_000, "the ETA counts down with the line's age")
  const next = sampleProgress('{"stage":"encode","done":3}', t0 + 20_000, kept)
  assert.deepEqual(next.progressFrom, { stage: "encode", done: 3, at: t0 + 20_000 }, "a new stage starts afresh")
  const counted = progressOf('{"stage":"encode","done":3}', t0 + 20_000, next as RunStatus, t0 + 20_000)
  assert.equal(counted.rate, undefined, "no rate from one sample")
  assert.equal(progressText(counted), "encode: 3")
  const text = progressOf("half way", t0, null, t0 + 3_000)
  assert.deepEqual(text, { line: "half way", ageMs: 3_000 })
  assert.equal(progressText(text), '"half way"')
  assert.deepEqual(progressOf('{"done":"many","stage":7}', t0, null, t0), { line: '{"done":"many","stage":7}', ageMs: 0 }, "wrong types are ignored")
})

test(
  "a run's structured progress is shown by run status, run list and wait, with its rate and ETA, and wait says it while it waits",
  { skip: !posix },
  async () => {
    const p = project()
    try {
      await inside(p, async () => {
        const line = (i: number) => `{"stage":"render","done":${i * 10},"total":100,"unit":"frames","overall":{"done":1,"total":4,"unit":"scenes"}}`
        const steps = [1, 2, 3, 4, 5].map((i) => `echo '${line(i)}' >> "$NAIMA_RUN_PROGRESS"; sleep 1`).join("; ")
        assert.equal(await p.run("run", "anim", "--budget-time", "1m", "--every", "1s", "--", steps), 0)
        assert.match(out(p), /progress \(the command writes a line to \$NAIMA_RUN_PROGRESS, such as \{"stage"/)
        p.output.length = 0
        p.errors.length = 0
        assert.equal(await p.run("wait", "anim", "--timeout", "30s", "--report", "1s"), 0)
        assert.ok(
          p.errors.some((e) => /^run anim: running, \d+s · progress 1\/4 scenes \(25%\).* — render: \d+\/100 frames \(\d+%\)/.test(e)),
          p.errors.join("\n"),
        )
        assert.match(out(p), /progress: 1\/4 scenes \(25%\) — render: 50\/100 frames \(50%\) · [\d.]+\/s · ETA \d+s \(\d+s ago\)/)
        const v = await statusOf(p, "anim")
        assert.equal(v.progress?.stage, "render")
        assert.equal(v.progress?.done, 50)
        assert.equal(v.progress?.total, 100)
        assert.equal(v.progress?.unit, "frames")
        assert.ok((v.progress?.rate ?? 0) > 0, "a rate from two samples")
        assert.equal(typeof v.progress?.etaMs, "number")
        p.output.length = 0
        await p.run("run", "list")
        assert.match(out(p), /^anim {2}succeeded {2}\d+s of 1m {2}progress 1\/4 scenes \(25%\) — render: 50\/100 frames \(50%\) · .*ETA/m)
      })
    } finally {
      p.cleanup()
    }
  },
)

test("a run silent past --stale is STALE even while its log grows; a --no-progress run is judged on its log and shows its reason and last log line", async () => {
  const p = project()
  try {
    record(p, "quiet", { startedAgoMs: 600_000, staleMs: 120_000 })
    record(p, "excused", { startedAgoMs: 600_000, staleMs: 900_000, noProgress: "the solver has no progress interface" })
    record(p, "moving", { startedAgoMs: 600_000, staleMs: 120_000, progress: '{"stage":"a","done":1}' })
    record(p, "gone-quiet", { startedAgoMs: 3_600_000, staleMs: 900_000, noProgress: "no API", logAgoMs: 1_800_000 })
    p.output.length = 0
    await p.run("run", "list")
    const lines = p.output
    assert.match(lines.find((l) => l.startsWith("quiet "))!, /^quiet {2}STALE /, "a log that grows does not hide missing progress")
    assert.match(
      lines.find((l) => l.startsWith("excused "))!,
      /^excused {2}running {2}10m of 2h {2}no progress \(the solver has no progress interface\) last said "linking stage 2"$/,
    )
    assert.match(lines.find((l) => l.startsWith("moving "))!, /^moving {2}running .*progress a: 1 /)
    assert.match(lines.find((l) => l.startsWith("gone-quiet "))!, /^gone-quiet {2}STALE /)
    p.output.length = 0
    await p.run("run", "status", "excused")
    assert.match(out(p), /time: 10m of 2h\n {2}pid: 1\n {2}no progress: the solver has no progress interface\n {2}last said: "linking stage 2"/)
    await assert.rejects(() => p.run("run", "x", "--budget-time", "1m", "--no-progress", " ", "--", "true"), /--no-progress needs the reason/)
  } finally {
    p.cleanup()
  }
})

test(
  "--no-progress is kept with the run, sets the 15-minute stale default, and shows in wait; without it the default is 2 minutes",
  { skip: !posix },
  async () => {
    const p = project()
    try {
      await inside(p, async () => {
        assert.equal(
          await p.run("run", "solve", "--budget-time", "1m", "--every", "1s", "--no-progress", "the tool has none", "--", "echo working; sleep 2"),
          0,
        )
        assert.match(out(p), /no progress: the tool has none — its elapsed time and the log's last line are shown instead/)
        assert.equal(await p.run("run", "plain", "--budget-time", "1m", "--every", "1s", "--", "true"), 0)
        const spec = (n: string) => JSON.parse(readFileSync(join(runs(p), n, "run.json"), "utf8")) as { noProgress?: string; staleMs: number }
        assert.equal(spec("solve").noProgress, "the tool has none")
        assert.equal(spec("solve").staleMs, 900_000)
        assert.equal(spec("plain").staleMs, 120_000)
        p.errors.length = 0
        p.output.length = 0
        assert.equal(await p.run("wait", "solve", "--timeout", "30s", "--report", "1s"), 0)
        assert.ok(p.errors.some((e) => /^run solve: running, \d+s · no progress \(the tool has none\), last said "working"$/.test(e)), p.errors.join("\n"))
        assert.match(out(p), /no progress: the tool has none\n {2}last said: "working"/)
      })
    } finally {
      p.cleanup()
    }
  },
)

const FAKE_SSH = `#!/bin/sh
while [ $# -gt 1 ]; do
  case "$1" in -o) shift 2 ;; *) shift; break ;; esac
done
exec sh -c "$1"
`

test("on a host, the host's Naima computes the progress and its view carries it unchanged", {
  skip: (!hasDeno || !posix) && "needs deno and a POSIX shell",
  timeout: 120_000,
}, async () => {
  const host = project()
  const bin = mkdtempSync(join(tmpdir(), "naima-fake-ssh-"))
  writeFileSync(join(bin, "ssh"), FAKE_SSH)
  chmodSync(join(bin, "ssh"), 0o755)
  const naima = `deno run -A ${CLI} --data ${join(host.root, "naima-tracker", "naima-data")}`
  const p = tempProject([trackers(), rules(), longWork({ hosts: { lab: { ssh: "me@lab.invalid", dir: host.root, naima } } })], { git: true })
  const path = process.env["PATH"]
  process.env["PATH"] = `${bin}:${path}`
  try {
    const steps = [1, 2, 3].map((i) => `echo '{"stage":"bench","done":${i},"total":6,"unit":"cases"}' >> "$NAIMA_RUN_PROGRESS"; sleep 1`).join("; ")
    assert.equal(await p.run("run", "far", "--host", "lab", "--budget-time", "1m", "--every", "1s", "--", steps), 0)
    p.output.length = 0
    assert.equal(await p.run("wait", "far", "--timeout", "60s", "--every", "1s"), 0)
    assert.match(out(p), /run far on lab: succeeded/)
    assert.match(out(p), /progress: bench: 3\/6 cases \(50%\)/)
    const v = await statusOf(p, "far")
    assert.equal(v.host, "lab")
    assert.equal(v.progress?.done, 3)
    assert.equal(v.progress?.total, 6)
    assert.ok((v.progress?.rate ?? 0) > 0, "the host's rate, carried through")
  } finally {
    process.env["PATH"] = path
    removeTemp(bin)
    host.cleanup()
    p.cleanup()
  }
})

test("shell words: quotes, escapes, operators and comments; naima run found in each simple command", () => {
  assert.deepEqual(shellWords(`a 'b c' "d \\"e\\"" f\\ g; h && i # j`).words, ["a", "b c", 'd "e"', "f g", ";", "h", "&&", "i"])
  const script = [
    "#!/bin/sh",
    "naima run bench --budget-time 1h -- ./bench.sh",
    'cd x && deno task naima run solve --budget-time 2h --no-progress "the solver has no API" -- ./solve.sh',
    "# naima run commented --budget-time 1h -- ./x",
    "naima run list",
    "naima run c --budget-time 1h \\",
    "  -- ./long.sh",
  ].join("\n")
  const found = findRuns(script, SUBCOMMANDS)
  assert.deepEqual(found.map((r) => [r.line, r.command.join(" ")]), [[2, "./bench.sh"], [3, "./solve.sh"], [6, "./long.sh"]])
  assert.equal(noProgressOf(found[1]!.options), "the solver has no API")
  assert.equal(noProgressOf(["--no-progress="]), undefined)
  const reporting = new Set(["verify"])
  assert.ok(commandReports(["naima", "verify", "--all"], reporting))
  assert.ok(commandReports(["deno task build && naima verify --all"], reporting))
  assert.ok(commandReports(['echo 1 > "$NAIMA_RUN_PROGRESS"; make'], reporting))
  assert.ok(!commandReports(["./bench.sh"], reporting))
  assert.ok(!commandReports(["naima", "check"], reporting))
})

test("the check progress-declared: a long command declaring nothing, a script's naima run without progress or reason, and a silent recorded run", async () => {
  const p = project([renderer({})])
  try {
    mkdirSync(join(p.root, "scripts"), { recursive: true })
    writeFileSync(
      join(p.root, "scripts", "bench.sh"),
      [
        "#!/bin/sh",
        "naima run bench --budget-time 1h -- ./bench.sh",
        'naima run solve --budget-time 2h --no-progress "the solver has no API" -- ./solve.sh',
        "naima run frames --budget-time 2h -- naima render",
        `naima run own --budget-time 1h -- 'echo "{\\"done\\":1}" > "$NAIMA_RUN_PROGRESS"; make'`,
        "naima run waits --budget-time 1h -- naima wait bench",
        "",
      ].join("\n"),
    )
    p.git("add", "scripts/bench.sh")
    p.git("commit", "-q", "-m", "script")
    record(p, "silent", { startedAgoMs: 3_600_000, staleMs: 120_000 })
    record(p, "excused", { startedAgoMs: 3_600_000, staleMs: 900_000, noProgress: "no API" })
    record(p, "reporting", { startedAgoMs: 3_600_000, staleMs: 120_000, progress: "half way" })
    const check = p.ctx.registry.find<Check>("checks", "progress-declared")!.value
    const findings = await check.run(p.ctx)
    assert.deepEqual(findings.map((f) => [f.level, f.message.split(" — ")[0]]), [
      [
        "problem",
        "command render is declared long with neither how it reports progress (long.reports) nor why it cannot and what it reports instead (long.cannot, long.instead)",
      ],
      ["problem", 'scripts/bench.sh:2: naima run of "./bench.sh" declares no progress'],
      ["problem", 'scripts/bench.sh:4: naima run of "naima render" declares no progress'],
      ["note", "run silent has run 1h without writing a progress line, and declares no reason (--no-progress)"],
    ])
  } finally {
    p.cleanup()
  }
  const fine = project([renderer({ reports: "frames done of the total" })])
  try {
    mkdirSync(join(fine.root, "scripts"), { recursive: true })
    writeFileSync(join(fine.root, "scripts", "r.sh"), "naima run frames --budget-time 2h -- naima render\n")
    fine.git("add", "scripts/r.sh")
    fine.git("commit", "-q", "-m", "script")
    const check = fine.ctx.registry.find<Check>("checks", "progress-declared")!.value
    assert.deepEqual(await check.run(fine.ctx), [], "a run of a command that reports, declared so, is not reported")
  } finally {
    fine.cleanup()
  }
})

test("run list prints a view from an older host, without the computed fields, as text", () => {
  const v: RunView = {
    name: "old",
    state: "running",
    over: false,
    started: "",
    elapsedMs: 5_000,
    budgetTimeMs: 60_000,
    log: "",
    progress: { line: "step 3", ageMs: 1_000 },
  }
  assert.equal(listLine(v), 'old  running  5s of 1m  progress "step 3" 1s ago')
})
