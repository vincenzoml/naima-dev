// tools: a plugin declares its tools; naima tools reports, shows, installs,
// removes and finds them, and asks a host through its own Naima — against
// specs/tools-plugin-declares-tools-needs-naima-tools. No test downloads
// anything real: every source is a fixture served from 127.0.0.1, and hdiutil
// and the Python are stand-ins.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import trackers from "../../../naima/src/plugins/trackers/index.ts"
import { readReceipt, type ToolDeclaration, type ToolsWorld, toolsPlugin } from "../../../naima/src/plugins/tools/index.ts"
import { declarationRefusal } from "../../../naima/src/plugins/tools/contract.ts"
import { type Exec, readAr, realExec } from "../../../naima/src/plugins/tools/install.ts"
import { MCRL2, toolPath } from "../../../naima/src/plugins/verifier-mcrl2/index.ts"
import storm, { PYTHON, STORM } from "../../../naima/src/plugins/storm/index.ts"
import { permissions, uiGrant } from "../../../naima/src/launcher.ts"
import { platformKey, toolsDir } from "../../../naima/src/core/tools.ts"
import { buildRegistry } from "../../../naima/src/core/registry.ts"
import { corePlugin } from "../../../naima/src/core/base.ts"
import type { Config, Context, Plugin } from "../../../naima/src/core/api.ts"
import { createContext, removeTemp, type TempProject, tempProject } from "../../core/testing.ts"

const posix = process.platform !== "win32"
const PLATFORM = platformKey()
const sha = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex")
const size = (file: string): number => readFileSync(file).length

/** A directory of fixtures served over HTTP from 127.0.0.1, counting the requests. */
async function serve(dir: string): Promise<{ url: string; requests: string[]; close(): Promise<void> }> {
  const requests: string[] = []
  const server: Server = createServer((req, res) => {
    requests.push(req.url ?? "")
    const file = join(dir, (req.url ?? "/").slice(1))
    if (!existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { "content-type": "application/octet-stream" }).end(readFileSync(file))
  })
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((done) => server.close(() => done())) }
}

/** A tool's files: `<root>/<top>/bin/<program>`, a script printing `<program> <version>`. */
function toolTree(root: string, top: string, program: string, version: string): void {
  mkdirSync(join(root, top, "bin"), { recursive: true })
  writeFileSync(join(root, top, "bin", program), `#!/bin/sh\necho "${program} ${version}"\n`)
  chmodSync(join(root, top, "bin", program), 0o755)
}

const tar = (cwd: string, out: string, ...args: string[]): void => {
  const r = spawnSync("tar", [...args, "-f", out, "-C", cwd, "."], { encoding: "utf8" })
  assert.equal(r.status, 0, r.stderr)
}

/** An ar archive of `members`: the format a .deb is. */
function ar(members: [string, Uint8Array][]): Uint8Array {
  const parts: Uint8Array[] = [new TextEncoder().encode("!<arch>\n")]
  for (const [name, data] of members) {
    const header = `${(name + "/").padEnd(16)}${"0".padEnd(12)}${"0".padEnd(6)}${"0".padEnd(6)}${"100644".padEnd(8)}${String(data.length).padEnd(10)}\`\n`
    parts.push(new TextEncoder().encode(header), data)
    if (data.length % 2) parts.push(new TextEncoder().encode("\n"))
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** A declaration of `name` for this platform from `source`, checked by `<program> --version`. */
const decl = (name: string, source: Record<string, unknown>, extra: Partial<ToolDeclaration> = {}): ToolDeclaration => ({
  name,
  title: `the ${name} tool`,
  says: `a fixture tool, ${name}`,
  version: "1.0.0",
  licence: "MIT",
  homepage: "https://example.invalid",
  programs: [name],
  verify: { program: name, args: ["--version"], expect: `${name} 1.0.0` },
  platforms: { [PLATFORM]: source } as ToolDeclaration["platforms"],
  ...extra,
})

const fixturePlugin = (tools: ToolDeclaration[]): Plugin => ({
  name: "fixture-tools",
  contract: 1,
  says: "fixture tools for the tests",
  contributes: { tools },
  optional: ["tools"],
})

interface Bench {
  p: TempProject
  dir: string
  fixtures: string
  world: ToolsWorld
  answers: (string | null)[]
  calls: string[][]
  out(): string
  cleanup(): void
}

/** A project with the tools plugin and `tools`, a tools directory of its own, and a terminal that answers `answers` in turn. */
function bench(tools: ToolDeclaration[], fixtures: string, exec: Exec = realExec, extra: Plugin[] = []): Bench {
  const dir = join(mkdtempSync(join(tmpdir(), "naima-tools-")), "tools")
  const answers: (string | null)[] = []
  const calls: string[][] = []
  const world: ToolsWorld = {
    exec: (program, args, options) => {
      calls.push([program, ...args])
      return exec(program, args, options)
    },
    ask: () => Promise.resolve(answers.length ? answers.shift()! : null),
    env: { NAIMA_TOOLS: dir, USER: "tester" },
    os: process.platform,
    arch: process.arch,
  }
  const p = tempProject([trackers(), toolsPlugin(() => world), fixturePlugin(tools), ...extra])
  return {
    p,
    dir,
    fixtures,
    world,
    answers,
    calls,
    out: () => p.output.join("\n"),
    cleanup() {
      p.cleanup()
      removeTemp(join(dir, ".."))
      removeTemp(fixtures)
    },
  }
}

/** A served tar.gz of the tool `name`, and its declaration. */
function tgzTool(fixtures: string, url: string, name: string, version = "1.0.0", extra: Partial<ToolDeclaration> = {}): ToolDeclaration {
  const tree = mkdtempSync(join(tmpdir(), "naima-tree-"))
  toolTree(tree, name, name, version)
  tar(tree, join(fixtures, `${name}.tar.gz`), "-cz")
  rmSync(tree, { recursive: true, force: true })
  const f = join(fixtures, `${name}.tar.gz`)
  return decl(name, { url: `${url}/${name}.tar.gz`, size: size(f), sha256: sha(f), format: "tar.gz", bin: `${name}/bin` }, extra)
}

const CONSENT = ["--consent", "yes, install it", "--by", "owner"]

test("a declaration lacking its version, licence, verify, or a source lacking url, size or sha256, is refused at load, naming the plugin; the shipped ones load", () => {
  const good = decl("fake", { url: "https://example.invalid/f.tar.gz", size: 1, sha256: "a".repeat(64), format: "tar.gz", bin: "bin" })
  assert.equal(declarationRefusal(good), null)
  const { version: _v, ...noVersion } = good
  assert.match(declarationRefusal(noVersion) ?? "", /has no version/)
  assert.match(declarationRefusal({ ...good, licence: "" }) ?? "", /has no licence/)
  assert.match(declarationRefusal({ ...good, verify: undefined }) ?? "", /has no verify/)
  assert.match(declarationRefusal({ ...good, verify: { program: "other", args: [], expect: "x" } }) ?? "", /not one of its programs/)
  for (const [key, why] of [["url", /no url/], ["size", /no size/], ["sha256", /no sha256/]] as const) {
    const source = { ...good.platforms[PLATFORM as keyof ToolDeclaration["platforms"]] } as Record<string, unknown>
    delete source[key]
    assert.match(declarationRefusal({ ...good, platforms: { [PLATFORM]: source } }) ?? "", why)
  }
  assert.match(declarationRefusal({ ...good, platforms: { "beos-ppc": { unavailable: "no" } } }) ?? "", /not one of darwin-arm64/)
  assert.match(declarationRefusal({ ...good, platforms: { "linux-x64": { unavailable: "" } } }) ?? "", /must say why/)
  const pip = { url: "pypi", size: 1, format: "pip", python: "python", bin: "venv/bin", requirements: ["stormpy>=1"] }
  assert.match(declarationRefusal({ ...good, platforms: { "linux-x64": pip } }) ?? "", /not pinned with == and its --hash/)
  assert.throws(() => buildRegistry([corePlugin, toolsPlugin(), fixturePlugin([noVersion as ToolDeclaration])]), /fixture-tools/)
  for (const t of [MCRL2, PYTHON, STORM]) assert.equal(declarationRefusal(t), null, t.name)
  assert.doesNotThrow(() => buildRegistry([corePlugin, toolsPlugin(), storm()]))
})

test("the shipped declarations: mCRL2 202607.0 for both Macs, Linux x86_64 and Windows; Storm for Macs and Linux; plain answers elsewhere", () => {
  assert.equal(MCRL2.version, "202607.0")
  assert.deepEqual(Object.keys(MCRL2.platforms).sort(), ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "windows-x64"])
  assert.match(MCRL2.platforms["linux-arm64"].unavailable, /no Linux arm64 build/)
  assert.equal(MCRL2.platforms["linux-x64"].format, "deb")
  assert.equal(MCRL2.platforms["windows-x64"].format, "zip")
  assert.equal(MCRL2.platforms["darwin-arm64"].format, "dmg")
  assert.equal(STORM.version, "1.14.0")
  assert.deepEqual(STORM.needs, ["python"])
  assert.match(STORM.platforms["windows-x64"].unavailable, /no Windows build.*--host/)
  for (const p of ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"] as const) {
    const s = STORM.platforms[p]
    assert.equal(s.format, "pip")
    assert.ok(s.requirements.every((r) => /==/.test(r) && /--hash=sha256:[0-9a-f]{64}/.test(r)))
  }
  assert.match(PYTHON.verify.expect, /Python 3\.13\.16/)
})

test("naima tools reports each declared tool as installed, missing, unavailable, or undeclared here, and writes nothing", { skip: !posix }, async () => {
  const fixtures = mkdtempSync(join(tmpdir(), "naima-fixtures-"))
  const server = await serve(fixtures)
  const here = tgzTool(fixtures, server.url, "here")
  const absent = tgzTool(fixtures, server.url, "absent")
  const elsewhere = { ...decl("nowhere", {}), platforms: { [PLATFORM]: { unavailable: "no build for this one — use a host" } } as ToolDeclaration["platforms"] }
  const other = PLATFORM === "linux-x64" ? "darwin-arm64" : "linux-x64"
  const foreign = { ...decl("foreign", {}), platforms: { [other]: { unavailable: "x" } } as ToolDeclaration["platforms"] }
  const b = bench([here, absent, elsewhere, foreign], fixtures)
  try {
    assert.equal(await b.p.run("tools", "install", "here", ...CONSENT), 0)
    mkdirSync(join(b.dir, "absent", "0.9.0"), { recursive: true })
    writeFileSync(join(b.dir, "absent", "0.9.0", "naima-tool.json"), "{}")
    const before = readdirSync(b.dir).sort()
    b.p.output.length = 0
    assert.equal(await b.p.run("tools"), 0)
    assert.match(b.out(), new RegExp(`tools on this machine \\(${PLATFORM}\\), in ${b.dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
    assert.match(b.out(), /here +1\.0\.0 +installed/)
    assert.match(b.out(), /absent +1\.0\.0 +missing — naima tools install absent \(also installed: 0\.9\.0\)/)
    assert.match(b.out(), /nowhere +1\.0\.0 +unavailable here — no build for this one — use a host/)
    assert.match(b.out(), new RegExp(`foreign +1\\.0\\.0 +no declaration for ${PLATFORM}`))
    b.p.output.length = 0
    assert.equal(await b.p.run("tools", "--json"), 0)
    const r = JSON.parse(b.out()) as { platform: string; tools: { name: string; state: string }[] }
    assert.equal(r.platform, PLATFORM)
    assert.deepEqual(r.tools.map((t) => [t.name, t.state]), [["here", "installed"], ["absent", "missing"], ["nowhere", "unavailable"], ["foreign", "undeclared"]])
    assert.deepEqual(readdirSync(b.dir).sort(), before, "reporting writes nothing")
    b.p.output.length = 0
    assert.equal(await b.p.run("tools", "show", "absent"), 0)
    assert.match(b.out(), /absent 1\.0\.0\n {4}source: {2}http:\/\/127\.0\.0\.1:\d+\/absent\.tar\.gz\n {4}size: .*sha256 [0-9a-f]{64}\n {4}licence: MIT/)
  } finally {
    await server.close()
    b.cleanup()
  }
})

test("an install goes on only with consent — a yes on the terminal, or --consent with --by — and records it in the receipt", { skip: !posix }, async () => {
  const fixtures = mkdtempSync(join(tmpdir(), "naima-fixtures-"))
  const server = await serve(fixtures)
  const fake = tgzTool(fixtures, server.url, "fake")
  const b = bench([fake], fixtures)
  try {
    await assert.rejects(b.p.run("tools", "install", "fake"), /no terminal to ask on: an install needs consent.*--consent "<their yes, restated>" --by <who>/)
    assert.match(b.out(), /To install on this machine:\n {2}fake 1\.0\.0\n {4}source:/)
    b.answers.push("n")
    await assert.rejects(b.p.run("tools", "install", "fake"), /not installed: the answer was not yes/)
    await assert.rejects(b.p.run("tools", "install", "fake", "--consent", "yes"), /--consent needs the yes, restated, and --by/)
    assert.deepEqual(server.requests, [], "nothing fetched without consent")
    b.answers.push("yes")
    assert.equal(await b.p.run("tools", "install", "fake"), 0)
    const receipt = readReceipt(join(b.dir, "fake", "1.0.0"))!
    assert.equal(receipt.consent.how, "asked on the terminal")
    assert.equal(receipt.consent.by, "tester")
    assert.equal(receipt.sha256, (fake.platforms[PLATFORM as "linux-x64"] as { sha256: string }).sha256)
    rmSync(join(b.dir, "fake"), { recursive: true })
    assert.equal(await b.p.run("tools", "install", "fake", ...CONSENT), 0)
    const flagged = readReceipt(join(b.dir, "fake", "1.0.0"))!
    assert.deepEqual([flagged.consent.how, flagged.consent.by, flagged.consent.words], ["given with --consent", "owner", "yes, install it"])
    assert.match(flagged.consent.at, /^\d{4}-\d\d-\d\dT/)
    b.p.output.length = 0
    const fetched = server.requests.length
    assert.equal(await b.p.run("tools", "install", "fake"), 0)
    assert.match(b.out(), /fake 1\.0\.0 is already installed/)
    assert.equal(server.requests.length, fetched, "an installed tool is not fetched again")
  } finally {
    await server.close()
    b.cleanup()
  }
})

test("a download whose sha256 or size differs from the declaration stops the install and leaves nothing installed", { skip: !posix }, async () => {
  const fixtures = mkdtempSync(join(tmpdir(), "naima-fixtures-"))
  const server = await serve(fixtures)
  const fake = tgzTool(fixtures, server.url, "fake")
  const source = fake.platforms[PLATFORM as "linux-x64"]! as { size: number; sha256: string }
  const wrongSha = { ...fake, platforms: { [PLATFORM]: { ...source, sha256: "0".repeat(64) } } as ToolDeclaration["platforms"] }
  const b = bench([wrongSha], fixtures)
  const small = { ...fake, name: "small", platforms: { [PLATFORM]: { ...source, size: source.size - 10 } } as ToolDeclaration["platforms"] }
  const large = { ...fake, name: "large", platforms: { [PLATFORM]: { ...source, size: source.size + 10 } } as ToolDeclaration["platforms"] }
  const c = bench([small, large], fixtures)
  try {
    await assert.rejects(b.p.run("tools", "install", "fake", ...CONSENT), /the download's sha256 is [0-9a-f]{64}, the declaration says 0{64} — nothing installed/)
    assert.deepEqual(readdirSync(b.dir), [], "no tool, no staging directory")
    await assert.rejects(c.p.run("tools", "install", "small", ...CONSENT), /larger than the declared \d+ bytes — stopped, nothing installed/)
    await assert.rejects(c.p.run("tools", "install", "large", ...CONSENT), /downloaded \d+ bytes, the declaration says \d+ — nothing installed/)
    assert.deepEqual(readdirSync(c.dir), [])
  } finally {
    await server.close()
    b.cleanup()
    c.cleanup()
  }
})

test("tar.gz, zip and deb unpack into the tools directory alone, the tool verified by running it; one that fails its check is not kept", { skip: !posix }, async () => {
  const fixtures = mkdtempSync(join(tmpdir(), "naima-fixtures-"))
  const server = await serve(fixtures)
  const tools: ToolDeclaration[] = [tgzTool(fixtures, server.url, "tgz")]
  // A .deb: an ar archive whose data.tar.gz holds usr/bin/<program>.
  const tree = mkdtempSync(join(tmpdir(), "naima-tree-"))
  toolTree(tree, "usr", "debtool", "1.0.0")
  tar(tree, join(fixtures, "data.tar.gz"), "-cz")
  writeFileSync(join(fixtures, "debtool.deb"), ar([["debian-binary", new TextEncoder().encode("2.0\n")], ["control.tar.gz", new Uint8Array(3)], ["data.tar.gz", readFileSync(join(fixtures, "data.tar.gz"))]]))
  const deb = join(fixtures, "debtool.deb")
  tools.push(decl("debtool", { url: `${server.url}/debtool.deb`, size: size(deb), sha256: sha(deb), format: "deb", bin: "usr/bin" }))
  if (process.platform === "darwin") {
    // bsdtar writes and reads zip; on Linux the zip path is unzip's.
    const zipTree = mkdtempSync(join(tmpdir(), "naima-tree-"))
    toolTree(zipTree, "ziptool-1.0.0", "ziptool", "1.0.0")
    const r = spawnSync("tar", ["-a", "-cf", join(fixtures, "ziptool.zip"), "-C", zipTree, "."])
    assert.equal(r.status, 0)
    const zip = join(fixtures, "ziptool.zip")
    tools.push(decl("ziptool", { url: `${server.url}/ziptool.zip`, size: size(zip), sha256: sha(zip), format: "zip", bin: "ziptool-1.0.0/bin" }))
  }
  tools.push(tgzTool(fixtures, server.url, "liar", "0.9.0", { verify: { program: "liar", args: ["--version"], expect: "liar 1.0.0" } }))
  const b = bench(tools, fixtures)
  const home = process.env["HOME"]
  const path = process.env["PATH"]
  try {
    for (const t of tools.filter((t) => t.name !== "liar")) {
      b.p.output.length = 0
      assert.equal(await b.p.run("tools", "install", t.name, ...CONSENT), 0, t.name)
      assert.match(b.out(), new RegExp(`${t.name}: verified — ${t.name} 1\\.0\\.0`))
      const root = join(b.dir, t.name, "1.0.0")
      assert.ok(existsSync(join(root, "naima-tool.json")), `${t.name}: its receipt`)
      b.p.output.length = 0
      assert.equal(await b.p.run("tools", "path", t.name), 0)
      assert.equal(spawnSync(b.out(), ["--version"], { encoding: "utf8" }).stdout.trim(), `${t.name} 1.0.0`)
    }
    await assert.rejects(b.p.run("tools", "install", "liar", ...CONSENT), /liar: the install does not run here — liar --version did not print "liar 1\.0\.0".*nothing installed/)
    assert.equal(existsSync(join(b.dir, "liar")), false)
    assert.deepEqual(readdirSync(b.dir).sort(), tools.filter((t) => t.name !== "liar").map((t) => t.name).sort(), "the tools, and no staging directory")
    assert.equal(process.env["HOME"], home)
    assert.equal(process.env["PATH"], path, "PATH untouched")
    rmSync(b.dir, { recursive: true })
    b.p.output.length = 0
    await b.p.run("tools", "--json")
    const after = JSON.parse(b.out()) as { tools: { state: string }[] }
    assert.ok(after.tools.every((t) => t.state === "missing"), "deleting the directory removes every tool")
  } finally {
    await server.close()
    b.cleanup()
    rmSync(tree, { recursive: true, force: true })
  }
})

test("a dmg is mounted read-only with hdiutil inside the staging directory, its app copied out, its licence prompt answered after consent, and detached", { skip: !posix }, async () => {
  const fixtures = mkdtempSync(join(tmpdir(), "naima-fixtures-"))
  writeFileSync(join(fixtures, "app.dmg"), "an image")
  const server = await serve(fixtures)
  const inputs: (string | undefined)[] = []
  // hdiutil, stood in for: attach fills the mount point with the app; detach empties it.
  const exec: Exec = (program, args, options) => {
    if (program === "ditto") {
      cpSync(args[0]!, args[1]!, { recursive: true })
      return { status: 0, stdout: "", stderr: "" }
    }
    if (program !== "hdiutil") return realExec(program, args, options)
    if (args[0] === "attach") {
      inputs.push(options?.input)
      const mount = args[args.indexOf("-mountpoint") + 1]!
      toolTree(join(mount, "Tool.app"), "Contents", "dmgtool", "1.0.0")
    } else rmSync(args[args.length - 1]!, { recursive: true, force: true })
    return { status: 0, stdout: "", stderr: "" }
  }
  const f = join(fixtures, "app.dmg")
  const dmg = decl("dmgtool", { url: `${server.url}/app.dmg`, size: size(f), sha256: sha(f), format: "dmg", app: "Tool.app", bin: "Tool.app/Contents/bin" })
  const b = bench([dmg], fixtures, exec)
  try {
    assert.equal(await b.p.run("tools", "install", "dmgtool", ...CONSENT), 0)
    const hdiutil = b.calls.filter((c) => c[0] === "hdiutil")
    assert.deepEqual(hdiutil[0]!.slice(0, 6), ["hdiutil", "attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint"])
    assert.match(hdiutil[0]![6]!, /\.staging-[0-9a-f-]+\/mnt$/)
    assert.deepEqual(hdiutil[1]!.slice(0, 2), ["hdiutil", "detach"])
    assert.deepEqual(b.calls.find((c) => c[0] === "ditto")!.slice(1).map((p) => p.replace(/.*\.staging-[0-9a-f-]+\//, "")), ["mnt/Tool.app", "root/Tool.app"])
    assert.deepEqual(inputs, ["Y\n"])
    assert.ok(existsSync(join(b.dir, "dmgtool", "1.0.0", "Tool.app", "Contents", "bin", "dmgtool")))
  } finally {
    await server.close()
    b.cleanup()
  }
})

// A stand-in for a Python: --version answers; -m venv makes a venv whose python records pip's arguments and imports the package.
const FAKE_PYTHON = `#!/bin/sh
case "$1" in
  --version) echo "Python 3.13.16" ;;
  -m) if [ "$2" = venv ]; then
        mkdir -p "$3/bin"
        cat > "$3/bin/python" <<'PY'
#!/bin/sh
here=$(dirname "$0")
case "$1" in
  -m) echo "$@" > "$here/../pip-args"; for last in "$@"; do :; done; cp "$last" "$here/../requirements" ;;
  -c) echo "stormpy 1.14.0" ;;
esac
PY
        chmod +x "$3/bin/python"
      fi ;;
esac
`

test("a pip source is installed by the needed Python into a venv, hash-checked and binary only; that Python cannot be removed under it", { skip: !posix }, async () => {
  const fixtures = mkdtempSync(join(tmpdir(), "naima-fixtures-"))
  const server = await serve(fixtures)
  const tree = mkdtempSync(join(tmpdir(), "naima-tree-"))
  mkdirSync(join(tree, "python", "bin"), { recursive: true })
  writeFileSync(join(tree, "python", "bin", "python"), FAKE_PYTHON)
  chmodSync(join(tree, "python", "bin", "python"), 0o755)
  tar(tree, join(fixtures, "python.tar.gz"), "-cz")
  const f = join(fixtures, "python.tar.gz")
  const python = { ...PYTHON, platforms: { [PLATFORM]: { url: `${server.url}/python.tar.gz`, size: size(f), sha256: sha(f), format: "tar.gz", bin: "python/bin" } } } as ToolDeclaration
  const requirement = `stormpy==1.14.0 --hash=sha256:${"a".repeat(64)}`
  const stormDecl = {
    ...STORM,
    platforms: { [PLATFORM]: { url: "https://pypi.org/simple", size: 1000, format: "pip", python: "python", bin: "venv/bin", requirements: [requirement] } },
  } as ToolDeclaration
  const b = bench([python, stormDecl], fixtures)
  try {
    b.p.output.length = 0
    assert.equal(await b.p.run("tools", "show", "storm", "--json"), 0)
    assert.deepEqual((JSON.parse(b.out()) as { tool: string }[]).map((s) => s.tool), ["python", "storm"], "the Python first")
    b.p.output.length = 0
    assert.equal(await b.p.run("tools", "install", "storm", ...CONSENT), 0)
    assert.match(b.out(), /installed python 3\.13\.16\+20261003: .*\ninstalled storm 1\.14\.0: /s)
    const venv = join(b.dir, "storm", "1.14.0")
    assert.equal(
      readFileSync(join(venv, "venv", "pip-args"), "utf8").replace(/-r \S+/, "-r <file>").trim(),
      "-m pip install --require-hashes --only-binary :all: --no-deps --disable-pip-version-check --no-input -r <file>",
    )
    assert.equal(readFileSync(join(venv, "venv", "requirements"), "utf8"), requirement + "\n")
    const venvMade = b.calls.find((c) => c[1] === "-m" && c[2] === "venv")!
    assert.equal(venvMade[0], join(b.dir, "python", "3.13.16+20261003", "python", "bin", "python"), "the venv is made by the installed Python")
    await assert.rejects(b.p.run("tools", "remove", "python"), /python is needed by storm, installed here — naima tools remove storm first; nothing removed/)
    b.p.output.length = 0
    assert.equal(await b.p.run("tools", "remove", "storm"), 0)
    assert.match(b.out(), /removed storm \(1\.14\.0\)/)
    assert.equal(await b.p.run("tools", "remove", "python"), 0)
    assert.deepEqual(readdirSync(b.dir), [])
    b.p.output.length = 0
    assert.equal(await b.p.run("tools", "remove", "python"), 0)
    assert.match(b.out(), /python is not installed here .*: nothing to remove/)
  } finally {
    await server.close()
    b.cleanup()
    rmSync(tree, { recursive: true, force: true })
  }
})

test("an installed mCRL2 is what the verifier runs, without PATH: bin wins, PATH is the fallback; the launcher lets every command read the tools directory and only naima tools write it", () => {
  const dir = mkdtempSync(join(tmpdir(), "naima-tools-"))
  const was = process.env["NAIMA_TOOLS"]
  process.env["NAIMA_TOOLS"] = dir
  try {
    assert.equal(toolPath("mcrl22lps"), "mcrl22lps", "not installed: PATH")
    const source = MCRL2.platforms[PLATFORM as keyof typeof MCRL2.platforms]
    if (source && !("unavailable" in source)) {
      const root = join(dir, "mcrl2", "202607.0")
      mkdirSync(join(root, source.bin), { recursive: true })
      const exe = process.platform === "win32" ? "mcrl22lps.exe" : "mcrl22lps"
      writeFileSync(join(root, source.bin, exe), "")
      assert.equal(toolPath("mcrl22lps"), "mcrl22lps", "no receipt: not installed")
      writeFileSync(join(root, "naima-tool.json"), "{}")
      assert.equal(toolPath("mcrl22lps"), join(root, source.bin, exe))
      assert.equal(toolPath("mcrl22lps", "/opt/mcrl2/bin"), join("/opt/mcrl2/bin", "mcrl22lps"), "bin wins")
    }
  } finally {
    if (was === undefined) delete process.env["NAIMA_TOOLS"]
    else process.env["NAIMA_TOOLS"] = was
    rmSync(dir, { recursive: true, force: true })
  }
  assert.equal(toolsDir({ NAIMA_TOOLS: "/x/tools" }, "linux"), "/x/tools")
  assert.equal(toolsDir({ HOME: "/home/a" }, "linux"), "/home/a/.local/share/naima/tools")
  assert.equal(toolsDir({ HOME: "/home/a", XDG_DATA_HOME: "/data" }, "linux"), "/data/naima/tools")
  assert.equal(toolsDir({ HOME: "/Users/a" }, "darwin"), "/Users/a/Library/Application Support/naima/tools")
  assert.equal(toolsDir({ LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" }, "windows"), join("C:\\Users\\a\\AppData\\Local", "naima", "tools"))
  assert.equal(platformKey("win32", "x64"), "windows-x64")
  assert.equal(platformKey("linux", "aarch64"), "linux-arm64")
  const fence = { root: "/r", tracker: "/r/naima-tracker", data: "/r/naima-tracker/naima-data", program: "/r/naima-tracker/naima", entry: "/r/naima-tracker/naima", tools: "/t/tools" }
  const plain = permissions({ ...fence, ui: uiGrant("check", "linux", "/deno", "/t/tools") })
  assert.match(plain[0]!, /--allow-read=.*\/t\/tools/, "every command reads the tools directory")
  assert.doesNotMatch(plain[1]!, /\/t\/tools/)
  assert.equal(plain[2], "--allow-run=git")
  assert.ok(!plain.some((f) => f.startsWith("--allow-net")))
  const tools = permissions({ ...fence, ui: uiGrant("tools", "linux", "/deno", "/t/tools") })
  assert.match(tools[1]!, /--allow-write=.*\/t\/tools/)
  assert.ok(tools.includes("--allow-run") && tools.includes("--allow-net"), "naima tools alone runs any program and reaches any host")
})

// A stand-in for ssh: it drops the options and the destination and runs the remote command line here, through sh.
const FAKE_SSH = `#!/bin/sh
while [ $# -gt 1 ]; do
  case "$1" in -o) shift 2 ;; *) shift; break ;; esac
done
exec sh -c "$1"
`

test("with --host, naima tools asks the host's own Naima: the plan first, the consent here, then the install with --consent and --by", { skip: !posix }, async () => {
  const bin = mkdtempSync(join(tmpdir(), "naima-fake-ssh-"))
  const log = join(bin, "calls")
  writeFileSync(join(bin, "ssh"), FAKE_SSH)
  const plan = JSON.stringify([{ tool: "fake", version: "1.0.0", licence: "MIT", homepage: "https://example.invalid", installed: false, url: "https://example.invalid/fake.tar.gz", size: 2000000, sha256: "b".repeat(64), format: "tar.gz" }])
  // The host's Naima, stood in for: it records each question and answers it.
  writeFileSync(
    join(bin, "host-naima"),
    `#!/bin/sh\nfor a in "$@"; do printf '[%s]' "$a" >> "${log}"; done; echo >> "${log}"\ncase "$2" in\n  show) echo '${plan}' ;;\n  install) echo "installed fake 1.0.0: /srv/tools/fake/1.0.0" ;;\n  *) echo "tools on this machine (linux-x64), in /srv/tools:" ;;\nesac\n`,
  )
  chmodSync(join(bin, "ssh"), 0o755)
  chmodSync(join(bin, "host-naima"), 0o755)
  const b = bench([], mkdtempSync(join(tmpdir(), "naima-fixtures-")))
  const config: Config = { ...b.p.ctx.config, plugins: { "long-work": { enabled: true, checks: {}, options: { hosts: { lab: { ssh: "me@lab.invalid", dir: bin, naima: join(bin, "host-naima") } } } } } }
  const ctx: Context = createContext({ root: b.p.root, data: b.p.ctx.trackerRoot, program: b.p.ctx.program }, config, b.p.ctx.registry, {
    out: (l = "") => void b.p.output.push(l),
    err: (l) => void b.p.errors.push(l),
    now: () => new Date(),
  })
  const cmd = toolsPlugin(() => b.world).commands![0]!
  const path = process.env["PATH"]
  process.env["PATH"] = `${bin}:${path}`
  try {
    assert.equal(await cmd.run(["--host", "lab"], ctx), 0)
    assert.match(b.out(), /lab: tools on this machine \(linux-x64\)/)
    await assert.rejects(Promise.resolve(cmd.run(["install", "fake", "--host", "lab"], ctx)), /no terminal to ask on/)
    assert.match(b.out(), /To install on lab \(me@lab\.invalid\):\n {2}fake 1\.0\.0\n {4}source: {2}https:\/\/example\.invalid\/fake\.tar\.gz\n {4}size: {4}2 MB download/)
    b.answers.push("y")
    b.p.output.length = 0
    assert.equal(await cmd.run(["install", "fake", "--host", "lab"], ctx), 0)
    assert.match(b.out(), /lab: installed fake 1\.0\.0: \/srv\/tools\/fake\/1\.0\.0/)
    const calls = readFileSync(log, "utf8").trim().split("\n")
    assert.deepEqual(calls, [
      "[tools]",
      "[tools][show][fake][--json]",
      "[tools][show][fake][--json]",
      "[tools][install][fake][--consent][y][--by][tester]",
    ], "one ssh call per question; the install carries the consent given here")
    await assert.rejects(Promise.resolve(cmd.run(["--host", "nowhere"], ctx)), /no host "nowhere" — declare it in naima\.json: plugins\.long-work\.options\.hosts\.nowhere.*declared: lab/)
  } finally {
    process.env["PATH"] = path
    removeTemp(bin)
    b.cleanup()
  }
})

test("readAr reads the members of an ar archive and refuses what is not one", () => {
  const members = readAr(ar([["debian-binary", new TextEncoder().encode("2.0\n")], ["data.tar.gz", new Uint8Array([1, 2, 3])]]))
  assert.deepEqual([...members.keys()], ["debian-binary", "data.tar.gz"])
  assert.deepEqual([...members.get("data.tar.gz")!], [1, 2, 3])
  assert.throws(() => readAr(new TextEncoder().encode("PK\u0003\u0004")), /not an ar archive/)
})
