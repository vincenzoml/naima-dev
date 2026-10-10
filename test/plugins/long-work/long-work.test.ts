// long-work: naima run, wait, run list/status/stop/clean, the shipped rule and
// the check wait-loops, against specs/long-work-naima-run-wait-run-list. Every
// run here has a budget of its own and every wait a timeout, so no test can hang.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import longWork, { describe as describeRun, LONG_WORK_RULE, unsafePath } from "../../../naima/src/plugins/long-work/index.ts"
import { findWaits } from "../../../naima/src/plugins/long-work/loops.ts"
import { parseDuration, parseSize, type RunView } from "../../../naima/src/plugins/long-work/records.ts"
import { readHosts, shellQuote, sshArgs } from "../../../naima/src/plugins/long-work/remote.ts"
import { platformOf } from "../../../naima/src/plugins/long-work/supervisor.ts"
import rules from "../../../naima/src/plugins/rules/index.ts"
import trackers from "../../../naima/src/plugins/trackers/index.ts"
import { uiGrant } from "../../../naima/src/launcher.ts"
import { groupAlive } from "../../core/processes.ts"
import { gitIn as git, productRepo, removeTemp, type TempProject, tempProject } from "../../core/testing.ts"
import type { Check } from "../../../naima/src/core/api.ts"

const REPO = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
const CLI = join(REPO, "naima", "src", "cli.ts")
const hasDeno = spawnSync("deno", ["--version"]).status === 0
const posix = process.platform !== "win32"

const project = (options: Record<string, unknown> = {}, ruleOptions: Record<string, unknown> = {}): TempProject =>
  tempProject([trackers(), rules(ruleOptions), longWork(options)], { git: true })

const runs = (p: TempProject): string => join(p.root, "naima-tracker", ".runs")

/** Run `fn` with the project's root as the working directory: where a run's command runs, as from a shell there. */
async function inside<T>(p: TempProject, fn: () => Promise<T>): Promise<T> {
  const was = process.cwd()
  process.chdir(p.root)
  try {
    return await fn()
  } finally {
    process.chdir(was)
  }
}

const out = (p: TempProject): string => p.output.join("\n")
const json = <T>(p: TempProject): T => JSON.parse(p.output.join("\n")) as T

async function statusOf(p: TempProject, name: string): Promise<RunView> {
  p.output.length = 0
  await p.run("run", "status", name, "--json")
  return json<RunView>(p)
}

test("a run outlives the naima that started it, with its log, its progress file and a record git ignores", { skip: !posix }, async () => {
  const p = project()
  try {
    await inside(p, async () => {
      const code = await p.run(
        "run",
        "hello",
        "--budget-time",
        "1m",
        "--every",
        "1s",
        "--",
        'echo hi; echo "step 1 of 1" > "$NAIMA_RUN_PROGRESS"; sleep 1; echo bye',
      )
      assert.equal(code, 0)
      assert.match(out(p), /run hello: started, pid \d+/)
      const v = await statusOf(p, "hello")
      assert.equal(v.state, "running", "the command still runs after naima run has returned")
      assert.equal(readFileSync(join(runs(p), ".gitignore"), "utf8"), "*\n")
      assert.equal(git(p.root, "status", "--porcelain"), "", "nothing of the record shows to git")
      p.output.length = 0
      assert.equal(await p.run("wait", "hello", "--timeout", "30s"), 0)
      assert.match(out(p), /run hello: succeeded — exit 0/)
      assert.match(out(p), /progress: "step 1 of 1"/)
      assert.match(out(p), / {4}hi\n {4}bye/)
      for (const f of ["run.json", "status.json", "log", "progress"]) assert.ok(existsSync(join(runs(p), "hello", f)), f)
    })
  } finally {
    p.cleanup()
  }
})

test("several words after -- are a program and its arguments, run without a shell", { skip: !posix }, async () => {
  const p = project()
  try {
    await inside(p, async () => {
      assert.equal(await p.run("run", "argv", "--budget-time", "1m", "--every", "1s", "--", "echo", "$HOME", "a;b"), 0)
      assert.equal(await p.run("wait", "argv", "--timeout", "30s"), 0)
      assert.match(out(p), / {4}\$HOME a;b/)
    })
  } finally {
    p.cleanup()
  }
})

test("a command that fails is reported failed with its exit code, and wait exits 1", { skip: !posix }, async () => {
  const p = project()
  try {
    await inside(p, async () => {
      await p.run("run", "fails", "--budget-time", "1m", "--every", "1s", "--", "echo broken >&2; exit 3")
      p.output.length = 0
      assert.equal(await p.run("wait", "fails", "--timeout", "30s"), 1)
      assert.match(out(p), /run fails: failed — exit 3/)
      assert.match(out(p), / {4}broken/)
    })
  } finally {
    p.cleanup()
  }
})

test("a run over its time budget is killed, its whole process group with it", { skip: !posix }, async () => {
  const p = project()
  try {
    await inside(p, async () => {
      await p.run("run", "slow", "--budget-time", "2s", "--every", "1s", "--", "sleep 60 & sleep 60")
      const started = Date.now()
      p.output.length = 0
      assert.equal(await p.run("wait", "slow", "--timeout", "40s"), 1)
      assert.ok(Date.now() - started < 20_000, "ended within a few checks of its budget")
      assert.match(out(p), /run slow: killed — over its time budget/)
      const v = await statusOf(p, "slow")
      assert.equal(v.reason, "budget-time")
      assert.ok(v.pid !== undefined)
      assert.equal(groupAlive(v.pid!), false, "the background child is gone too")
    })
  } finally {
    p.cleanup()
  }
})

test("a run over its disk budget is killed, its peak size recorded", { skip: !posix }, async () => {
  const p = project()
  try {
    await inside(p, async () => {
      await p.run(
        "run",
        "fills",
        "--budget-time",
        "1m",
        "--budget-disk",
        "1M",
        "--creates",
        "stores",
        "--every",
        "1s",
        "--",
        "mkdir -p stores && head -c 2097152 /dev/zero > stores/blob && sleep 60",
      )
      p.output.length = 0
      assert.equal(await p.run("wait", "fills", "--timeout", "40s"), 1)
      assert.match(out(p), /run fills: killed — over its disk budget/)
      const v = await statusOf(p, "fills")
      assert.equal(v.reason, "budget-disk")
      assert.ok((v.peakBytes ?? 0) >= 1024 * 1024, `peak ${v.peakBytes}`)
      assert.match(describeRun(v).join("\n"), /disk: 2\.0 MiB of 1\.0 MiB/)
    })
  } finally {
    p.cleanup()
  }
})

test("wait is bounded: at its timeout it says the run is still running and exits 1; stop ends the run", { skip: !posix }, async () => {
  const p = project()
  try {
    await inside(p, async () => {
      await p.run("run", "long", "--budget-time", "1m", "--every", "1s", "--creates", "scratch", "--", "mkdir -p scratch; sleep 60")
      p.output.length = 0
      assert.equal(await p.run("wait", "long", "--timeout", "1s"), 1)
      assert.match(out(p), /run long: still running/)
      assert.match(out(p), /naima wait: long is still running after 1s/)
      await assert.rejects(() => p.run("run", "clean", "long"), /run long is running — naima run stop long/)
      assert.equal(await p.run("run", "stop", "long"), 0)
      p.output.length = 0
      assert.equal(await p.run("wait", "long", "--timeout", "30s"), 1)
      assert.match(out(p), /run long: stopped/)
      await assert.rejects(() => p.run("run", "stop", "long"), /has already ended \(stopped\)/)
    })
  } finally {
    p.cleanup()
  }
})

test("run list shows each run against its budgets with its progress, and marks stale and lost runs", { skip: !posix }, async () => {
  const p = project()
  try {
    await inside(p, async () => {
      await p.run("run", "done", "--budget-time", "1m", "--every", "1s", "--", 'echo "half way" > "$NAIMA_RUN_PROGRESS"')
      await p.run("wait", "done", "--timeout", "30s")
      // Two records written by hand: a supervisor whose heartbeat stopped an hour ago, and one alive whose command is silent.
      const hour = Date.now() - 3_600_000
      const record = (name: string, staleMs: number, heartbeat: number) => {
        const dir = join(runs(p), name)
        mkdirSync(dir, { recursive: true })
        const spec = {
          name,
          command: ["x"],
          shell: true,
          cwd: p.root,
          budgetTimeMs: 7_200_000,
          creates: [],
          everyMs: 1000,
          staleMs,
          guardTracked: false,
          started: new Date(hour).toISOString(),
        }
        writeFileSync(join(dir, "run.json"), JSON.stringify(spec))
        writeFileSync(
          join(dir, "status.json"),
          JSON.stringify({ state: "running", supervisorPid: 1, pid: 1, heartbeat: new Date(heartbeat).toISOString(), elapsedMs: 0 }),
        )
        writeFileSync(join(dir, "log"), "old output\n")
        utimesSync(join(dir, "log"), new Date(hour), new Date(hour))
      }
      record("ghost", 60_000, hour)
      record("silent", 60_000, Date.now())
      p.output.length = 0
      assert.equal(await p.run("run", "list"), 0)
      const lines = p.output
      assert.match(lines.find((l) => l.startsWith("done "))!, /^done {2}succeeded {2}\d+s of 1m {2}progress "half way" \d+s ago$/)
      assert.match(lines.find((l) => l.startsWith("ghost "))!, /^ghost {2}LOST {2}1h of 2h/)
      assert.match(lines.find((l) => l.startsWith("silent "))!, /^silent {2}STALE {2}1h of 2h/)
      p.output.length = 0
      assert.equal(await p.run("wait", "ghost", "--timeout", "10s"), 1, "a lost run is over: wait returns at once")
      assert.match(out(p), /run ghost: lost — its supervisor is gone/)
      p.output.length = 0
      await p.run("run", "list", "--json")
      assert.deepEqual(json<RunView[]>(p).map((v) => v.state).sort(), ["lost", "stale", "succeeded"])
    })
  } finally {
    p.cleanup()
  }
})

test("run clean removes the declared paths and the record, and nothing else", { skip: !posix }, async () => {
  const p = project()
  try {
    await inside(p, async () => {
      writeFileSync(join(p.root, "keep.txt"), "mine\n")
      await p.run(
        "run",
        "tidy",
        "--budget-time",
        "1m",
        "--every",
        "1s",
        "--creates",
        "tmp-stores",
        "--creates",
        "never-made",
        "--",
        "mkdir -p tmp-stores/a && echo x > tmp-stores/a/f",
      )
      await p.run("wait", "tidy", "--timeout", "30s")
      assert.ok(existsSync(join(p.root, "tmp-stores", "a", "f")))
      p.output.length = 0
      assert.equal(await p.run("run", "clean", "tidy"), 0)
      assert.match(out(p), /removed .*tmp-stores and its record \(1 declared path already gone\)/)
      assert.equal(existsSync(join(p.root, "tmp-stores")), false)
      assert.equal(existsSync(join(runs(p), "tidy")), false)
      assert.equal(readFileSync(join(p.root, "keep.txt"), "utf8"), "mine\n")
      await assert.rejects(() => p.run("run", "clean", "tidy"), /no run "tidy" here/)
    })
  } finally {
    p.cleanup()
  }
})

test("a declared path that is the repository, above it, the home directory, or holds a tracked file is refused, at start and at clean", async () => {
  const p = project()
  try {
    writeFileSync(join(p.root, "tracked.txt"), "t\n")
    mkdirSync(join(p.root, "data"))
    writeFileSync(join(p.root, "data", "tracked.csv"), "a\n")
    p.git("add", "-A")
    p.git("commit", "-q", "-m", "tracked")
    assert.match(unsafePath(p.root, p.root)!, /repository root or a directory above it/)
    assert.match(unsafePath(p.root, dirname(p.root))!, /repository root or a directory above it/)
    assert.match(unsafePath(p.root, "/")!, /filesystem root/)
    if (process.env["HOME"]) assert.match(unsafePath(p.root, process.env["HOME"])!, /home directory|above it/)
    assert.match(unsafePath(p.root, join(p.root, "tracked.txt"))!, /tracked\.txt/)
    assert.match(unsafePath(p.root, join(p.root, "data"))!, /data\/tracked\.csv/)
    assert.equal(unsafePath(p.root, join(p.root, "stores")), null)
    assert.equal(unsafePath(p.root, join(tmpdir(), "elsewhere")), null)
    await inside(p, async () => {
      await assert.rejects(
        () => p.run("run", "bad", "--budget-time", "1m", "--creates", "data", "--", "true"),
        /--creates .*data is or holds a file git tracks/,
      )
    })
    assert.equal(existsSync(join(runs(p), "bad")), false, "a refused run writes nothing")
    // Clean checks again: a record whose declared path has come to hold a tracked file is refused, and nothing is removed.
    const dir = join(runs(p), "later")
    mkdirSync(dir, { recursive: true })
    const spec = {
      name: "later",
      command: ["true"],
      shell: true,
      cwd: p.root,
      budgetTimeMs: 60_000,
      creates: [join(p.root, "data")],
      everyMs: 1000,
      staleMs: 60_000,
      guardTracked: false,
      started: new Date().toISOString(),
    }
    writeFileSync(join(dir, "run.json"), JSON.stringify(spec))
    writeFileSync(
      join(dir, "status.json"),
      JSON.stringify({ state: "ended", supervisorPid: 1, heartbeat: new Date().toISOString(), elapsedMs: 1, reason: "exit", exitCode: 0 }),
    )
    await assert.rejects(() => p.run("run", "clean", "later"), /tracked\.csv\) — nothing removed/)
    assert.ok(existsSync(join(p.root, "data", "tracked.csv")))
  } finally {
    p.cleanup()
  }
})

test("naima run refuses a run with no time budget, a disk budget with nothing declared, a bad or taken name, and no command", async () => {
  const p = project()
  try {
    await inside(p, async () => {
      await assert.rejects(() => p.run("run", "x", "--", "true"), /every run has a time budget/)
      await assert.rejects(() => p.run("run", "x", "--budget-time", "1m", "--budget-disk", "1G", "--", "true"), /declare it with --creates/)
      await assert.rejects(() => p.run("run", "x", "--budget-time", "soon", "--", "true"), /"soon" is not a duration/)
      await assert.rejects(() => p.run("run", "Bad_Name", "--budget-time", "1m", "--", "true"), /is not a run name/)
      await assert.rejects(() => p.run("run", "x", "--budget-time", "1m"), /give the command after "--"/)
      await assert.rejects(() => p.run("run", "x", "--budget-time", "1m", "--host", "lab", "--", "true"), /no host "lab"/)
      await assert.rejects(() => p.run("wait", "nobody"), /no run "nobody" here/)
      if (posix) {
        await p.run("run", "x", "--budget-time", "1m", "--every", "1s", "--", "true")
        await assert.rejects(() => p.run("run", "x", "--budget-time", "1m", "--", "true"), /a run "x" is already recorded/)
        await p.run("wait", "x", "--timeout", "30s")
      }
    })
    assert.equal(parseDuration("90s"), 90_000)
    assert.equal(parseDuration("2h"), 7_200_000)
    assert.equal(parseDuration("0m"), null)
    assert.equal(parseSize("20G"), 20 * 1024 ** 3)
    assert.equal(parseSize("512"), 512)
    assert.equal(parseSize("1.5G"), null)
  } finally {
    p.cleanup()
  }
})

test("no source of the plugin looks a process up by a pattern: liveness is the supervisor's heartbeat", () => {
  const dir = join(REPO, "naima", "src", "plugins", "long-work")
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts") && n !== "loops.ts")) {
    const text = readFileSync(join(dir, f), "utf8")
    assert.doesNotMatch(text, /spawn(?:Sync)?\(\s*["'](?:ps|pgrep|pkill|tasklist)["']/, f)
  }
})

// A stand-in for ssh: it drops the options and the destination and runs the remote command line here, through sh.
const FAKE_SSH = `#!/bin/sh
while [ $# -gt 1 ]; do
  case "$1" in -o) shift 2 ;; *) shift; break ;; esac
done
exec sh -c "$1"
`

test("a remote run is one ssh call to the host's own Naima, always guarded, and a tracked file it changes fails it", {
  skip: (!hasDeno || !posix) && "needs deno and a POSIX shell",
  timeout: 120_000,
}, async () => {
  const host = project()
  const bin = mkdtempSync(join(tmpdir(), "naima-fake-ssh-"))
  writeFileSync(join(bin, "ssh"), FAKE_SSH)
  chmodSync(join(bin, "ssh"), 0o755)
  writeFileSync(join(host.root, "tracked.txt"), "as committed\n")
  host.git("add", "-A")
  host.git("commit", "-q", "-m", "tracked")
  const naima = `deno run -A ${CLI} --data ${join(host.root, "naima-tracker", "naima-data")}`
  const p = project({ hosts: { lab: { ssh: "me@lab.invalid", dir: host.root, naima } } })
  const path = process.env["PATH"]
  process.env["PATH"] = `${bin}:${path}`
  try {
    assert.equal(await p.run("run", "remote", "--host", "lab", "--budget-time", "1m", "--every", "1s", "--", "echo edited >> tracked.txt; echo remote done"), 0)
    assert.match(out(p), /lab: run remote: started/)
    assert.ok(existsSync(join(host.root, "naima-tracker", ".runs", "remote", "status.json")), "the host keeps the real record")
    assert.equal(JSON.parse(readFileSync(join(runs(p), "remote", "run.json"), "utf8")).host, "lab", "here, only the record naming the host")
    p.output.length = 0
    assert.equal(await p.run("wait", "remote", "--timeout", "60s", "--every", "1s"), 1)
    assert.match(out(p), /run remote on lab: failed — exit 0/)
    assert.match(out(p), /tracked files changed, which a guarded run must not: tracked\.txt/)
    assert.match(out(p), / {4}remote done/)
    p.output.length = 0
    await p.run("run", "list")
    assert.match(out(p), /^remote {2}failed {2}.*on lab/m)
    assert.equal(await p.run("run", "clean", "remote"), 0)
    assert.equal(existsSync(join(host.root, "naima-tracker", ".runs", "remote")), false)
    assert.equal(existsSync(join(runs(p), "remote")), false)
  } finally {
    process.env["PATH"] = path
    removeTemp(bin)
    host.cleanup()
    p.cleanup()
  }
})

test("ssh is called non-interactively, every word quoted for a POSIX shell; a host is declared whole", () => {
  const [host] = readHosts({ hosts: { lab: { ssh: "me@lab", dir: "/srv/my project" } } }).values()
  assert.deepEqual(sshArgs(host!, ["run", "x", "--", "echo 'a b'; ls"]), [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=15",
    "me@lab",
    `cd '/srv/my project' && deno run -A naima-tracker/naima/naima.ts run x -- 'echo '\\''a b'\\''; ls'`,
  ])
  assert.equal(shellQuote("plain-word_1.txt"), "plain-word_1.txt")
  assert.throws(() => readHosts({ hosts: { lab: { ssh: "-oProxyCommand=x", dir: "/d" } } }), /not starting with "-"/)
  assert.throws(() => readHosts({ hosts: { lab: { ssh: "me@lab" } } }), /needs "dir"/)
  assert.throws(() => readHosts({ hosts: [] }), /must be an object/)
})

test("the shipped long-work rule is listed for agents with its acknowledgement, and the project can retire it", async () => {
  const p = project()
  try {
    await p.run("rules", "--audience", "agents")
    assert.match(
      out(p),
      new RegExp(`MUST · agents · ${LONG_WORK_RULE.title} \\(long-work/long-work-through-naima-run, shipped by long-work, enforced by wait-loops`),
    )
    assert.match(out(p), /Acknowledge: Long work mode on/)
    p.output.length = 0
    assert.equal(await p.run("rules", "check-ack", join(p.root, "naima-tracker", "naima-data", "naima.json")), 1)
    assert.match(out(p), /missing acknowledgements: Long work mode on · Progress mode on/)
  } finally {
    p.cleanup()
  }
  const retired = project({}, { retire: ["long-work-through-naima-run", "long-work-reports-progress"] })
  try {
    await retired.run("rules", "--audience", "agents")
    assert.match(out(retired), /no active rules for agents/)
  } finally {
    retired.cleanup()
  }
  const wrong = project({}, { retire: ["no-such-rule"] })
  try {
    const check = wrong.ctx.registry.find<Check>("checks", "rules")!.value
    const findings = await check.run(wrong.ctx)
    assert.ok(findings.some((f) => f.level === "problem" && /retire option names "no-such-rule"/.test(f.message)))
  } finally {
    wrong.cleanup()
  }
})

test("hand-written waits are found: a pattern lookup, a loop that sleeps; a marked line, a comment and a loop that does not sleep are not", () => {
  const incident = 'until ! pgrep -f "naima.ts metrics"; do sleep 30; done'
  assert.deepEqual(findWaits(incident).map((w) => w.what), ["pattern lookup", "sleep loop"])
  assert.deepEqual(findWaits("while true\ndo\n  ssh lab cat progress\n  sleep 300\ndone\n").map((w) => [w.line, w.what]), [[1, "sleep loop"]])
  assert.deepEqual(findWaits("pkill -9 -f bench"), [{ line: 1, what: "pattern lookup", text: "pkill -9 -f bench" }])
  assert.deepEqual(findWaits('while read -r line; do echo "$line"; done < list.txt\n'), [])
  assert.deepEqual(findWaits("# while true; do sleep 1; done\n"), [])
  assert.deepEqual(findWaits("# naima: allow-wait-loop retrying a flaky mirror\nuntil curl -f x; do sleep 5; done\n"), [])
  assert.deepEqual(findWaits("pgrep bench\n"), [], "a lookup by exact name is not a pattern on command lines")
})

test("the check wait-loops reports a tracked script as a problem and a session note as a note", async () => {
  const p = project()
  try {
    mkdirSync(join(p.root, "scripts"))
    writeFileSync(join(p.root, "scripts", "bench.sh"), '#!/bin/sh\nwhile kill -0 "$PID"; do\n  sleep 10\ndone\n')
    writeFileSync(join(p.root, "scripts", "untracked.sh"), "while true; do sleep 1; done\n")
    p.git("add", "scripts/bench.sh")
    p.git("commit", "-q", "-m", "script")
    const notes = join(p.root, "naima-tracker", "naima-data", "passes")
    mkdirSync(notes, { recursive: true })
    writeFileSync(join(notes, "2026-10-07-x.md"), "Waited with `until ! pgrep -f metrics; do sleep 30; done`.\n")
    const check = p.ctx.registry.find<Check>("checks", "wait-loops")!.value
    const findings = await check.run(p.ctx)
    assert.deepEqual(findings.map((f) => [f.level, f.message.split(": a ")[0]]), [
      ["problem", "scripts/bench.sh:2"],
      ["note", "naima-tracker/naima-data/passes/2026-10-07-x.md:1"],
      ["note", "naima-tracker/naima-data/passes/2026-10-07-x.md:1"],
    ])
    assert.match(findings[0]!.message, /naima run and naima wait \(rule long-work\/long-work-through-naima-run\)/)
  } finally {
    p.cleanup()
  }
})

test("the platform choices: sh and a process group on macOS and Linux; cmd and taskkill /T on Windows", () => {
  for (const os of ["darwin", "linux"]) {
    const p = platformOf(os, {})
    assert.deepEqual(p.shell, ["sh", ["-c"]])
    assert.equal(p.groups, true)
    assert.equal(p.endTree(42, false), null)
  }
  const w = platformOf("win32", { COMSPEC: "C:\\Windows\\system32\\cmd.exe" })
  assert.deepEqual(w.shell, ["C:\\Windows\\system32\\cmd.exe", ["/d", "/s", "/c"]])
  assert.equal(w.groups, false)
  assert.deepEqual(w.endTree(42, false), ["taskkill", ["/pid", "42", "/T"]])
  assert.deepEqual(w.endTree(42, true), ["taskkill", ["/pid", "42", "/T", "/F"]])
  assert.deepEqual(platformOf("win32", {}).shell[0], "cmd.exe")
  assert.deepEqual(uiGrant("run", "linux", "/deno"), { net: [], read: ["/deno"], runs: ["/deno", "ssh"], wholeEnv: true })
  assert.deepEqual(uiGrant("wait", "windows", "/deno")?.runs, ["/deno", "ssh"])
  assert.equal(uiGrant("list", "linux", "/deno"), null)
})

test("through the real launcher: the run's supervisor is granted what it needs, the command gets the caller's environment, and wait reports it", {
  skip: (!hasDeno || !posix) && "needs deno and a POSIX shell",
  timeout: 120_000,
}, () => {
  const base = mkdtempSync(join(tmpdir(), "naima-long-work-"))
  try {
    const source = productRepo(join(base, "naima")).dir
    const host = join(base, "project")
    mkdirSync(host)
    writeFileSync(join(host, "README.md"), "# A project\n")
    git(host, "init", "-q", "-b", "main")
    git(host, "add", "-A")
    git(host, "commit", "-q", "-m", "init")
    git(host, "clone", "-q", "--", source, "naima-tracker/naima")
    const env = { ...process.env, NO_COLOR: "1", NAIMA_DATA: undefined, NAIMA_LAUNCHED: undefined, RUN_ONLY_VARIABLE: "carried" }
    const launch = (...args: string[]) => {
      const r = spawnSync("deno", ["run", "-A", join(host, "naima-tracker", "naima", "naima.ts"), ...args], { cwd: host, encoding: "utf8", env })
      return { code: r.status, out: `${r.stdout}${r.stderr}` }
    }
    assert.equal(launch("init").code, 0)
    const started = launch("run", "e2e", "--budget-time", "1m", "--every", "1s", "--", 'sleep 1; echo "variable: $RUN_ONLY_VARIABLE"')
    assert.equal(started.code, 0, started.out)
    const waited = launch("wait", "e2e", "--timeout", "60s")
    assert.equal(waited.code, 0, waited.out)
    assert.match(waited.out, /run e2e: succeeded — exit 0/)
    assert.match(waited.out, /variable: carried/)
  } finally {
    removeTemp(base)
  }
})
