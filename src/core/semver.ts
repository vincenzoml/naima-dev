// Just enough semver for a pin: `naima/config.json` names the Naima versions
// that may manage the project as a range, and a Naima outside it refuses.
// No dependencies, so the grammar is the common subset npm uses: `1.2.3`,
// `^1.2.3`, `~1.2.3`, `1.2.x`, `1.x`, `*`, comparators (`>=1.2.0 <2.0.0`)
// joined by spaces, and alternatives joined by `||`.

export type Version = [number, number, number, string]

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export function parseVersion(s: string): Version | null {
  const m = s.trim().match(VERSION)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? ""] : null
}

export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number)
  if (a[3] === b[3]) return 0
  if (!a[3]) return 1
  if (!b[3]) return -1
  return a[3] < b[3] ? -1 : 1
}

type Comparator = { op: "<" | "<=" | ">" | ">=" | "="; v: Version }

const X = /^(?:x|X|\*)$/

/** A partial version (`1`, `1.2`, `1.x`) as the numbers it fixes. */
type Partial = [number | null, number | null, number | null]

function partial(s: string): Partial | null {
  const parts = s.replace(/^v/, "").split("-")[0]?.split(".") ?? []
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p) && !X.test(p))) return null
  const at = (i: number): number | null => (parts[i] === undefined || X.test(parts[i] as string) ? null : Number(parts[i]))
  return [at(0), at(1), at(2)]
}

function comparators(token: string): Comparator[] | null {
  if (X.test(token) || token === "") return []
  const m = token.match(/^(\^|~|<=|>=|<|>|=)?(.+)$/)
  if (!m) return null
  const op = m[1] ?? ""
  const full = parseVersion(m[2] as string)
  const p = partial(m[2] as string)
  if (!p) return null
  const [M, n, pt] = p
  const lo = (a: number, b: number, c: number, pre = ""): Version => [a, b, c, pre]
  if (op === "^") {
    if (M === null) return []
    const base = full ?? lo(M, n ?? 0, pt ?? 0)
    const upper: Version = M > 0 || n === null ? lo(M + 1, 0, 0) : n > 0 || pt === null ? lo(0, n + 1, 0) : lo(0, 0, (pt as number) + 1)
    return [{ op: ">=", v: base }, { op: "<", v: upper }]
  }
  if (op === "~") {
    if (M === null) return []
    const base = full ?? lo(M, n ?? 0, pt ?? 0)
    return [{ op: ">=", v: base }, { op: "<", v: n === null ? lo(M + 1, 0, 0) : lo(M, n + 1, 0) }]
  }
  if (full && op) return [{ op: op as Comparator["op"], v: full }]
  if (full) return [{ op: "=", v: full }]
  // a partial version: an x-range, or a comparator against one
  if (M === null) return []
  const floor = lo(M, n ?? 0, pt ?? 0)
  const ceil = n === null ? lo(M + 1, 0, 0) : lo(M, n + 1, 0)
  switch (op) {
    case "":
    case "=":
      return [{ op: ">=", v: floor }, { op: "<", v: ceil }]
    case ">=":
      return [{ op: ">=", v: floor }]
    case ">":
      return [{ op: ">=", v: ceil }]
    case "<":
      return [{ op: "<", v: floor }]
    case "<=":
      return [{ op: "<", v: ceil }]
  }
  return null
}

/** The range as alternatives of comparator sets, or null when it is not one. */
export function parseRange(range: string): Comparator[][] | null {
  const out: Comparator[][] = []
  for (const alt of range.split("||")) {
    const set: Comparator[] = []
    for (const token of alt.trim().replace(/(<=|>=|<|>|=|\^|~)\s+/g, "$1").split(/\s+/)) {
      const c = comparators(token)
      if (!c) return null
      set.push(...c)
    }
    out.push(set)
  }
  return out
}

export function isRange(range: string): boolean {
  return typeof range === "string" && range.trim() !== "" && parseRange(range) !== null
}

/** Whether `version` is in `range`. A prerelease matches only a comparator on the same x.y.z, as npm does. */
export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version)
  const alts = parseRange(range)
  if (!v || !alts) return false
  return alts.some((set) => {
    if (v[3] && !set.some((c) => c.v[3] && c.v[0] === v[0] && c.v[1] === v[1] && c.v[2] === v[2])) return false
    return set.every(({ op, v: w }) => {
      const d = compareVersions(v, w)
      return op === "<" ? d < 0 : op === "<=" ? d <= 0 : op === ">" ? d > 0 : op === ">=" ? d >= 0 : d === 0
    })
  })
}

/** The highest of `versions` in `range`, or null. */
export function maxSatisfying(versions: string[], range: string): string | null {
  let best: string | null = null
  for (const s of versions) {
    const v = parseVersion(s)
    if (!v || !satisfies(s, range)) continue
    if (best === null || compareVersions(v, parseVersion(best) as Version) > 0) best = s
  }
  return best
}
