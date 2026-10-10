// The LTS route's soundness check (specs/verifier-mcrl2-lts-route-cross-check,
// §3): the fragment it accepts, what it refuses and why, the actions a formula
// mentions, and the action names of a label.

import assert from "node:assert/strict"
import { test } from "node:test"
import { checkFragment, includesTau, labelActions, parseFormula } from "../../../naima/src/plugins/verifier-mcrl2/formula.ts"

const accepted = (src: string): string[] => {
  const r = checkFragment(src)
  assert.ok(r.ok, `${src} should be in the fragment: ${r.ok ? "" : r.reason}`)
  return r.mentioned
}
const refused = (src: string, why: RegExp): void => {
  const r = checkFragment(src)
  assert.ok(!r.ok, `${src} should be refused`)
  assert.match(r.reason, why)
}

test("LTS route check: the forms of the fragment are accepted, the mentioned actions read wherever they occur", () => {
  // weak paths: visible steps after a τ-closed star, stars anywhere, nil skipped, choice of weak paths
  assert.deepEqual(accepted("forall q: Query, g: Node . [true* . deliver(q, g) . true* . deliver(q, g)] false"), ["deliver"])
  assert.deepEqual(accepted("forall n: Node . [true* . ready(n) . (!unregister(n))* . ready(n)] false"), ["ready", "unregister"])
  accepted("[true* . nil . a]false")
  accepted("[true* . (a + true* . b)]false")
  accepted("<true* . a . true*>true")
  accepted("[true* . exists p: Nat, b: List(Desc), g: List(Node) . query(q, p, b, g)]true")
  // joined nested modalities of one kind: [R1][R2]φ is [R1 . R2]φ
  assert.deepEqual(accepted("[true*][exists n: Node . o_vres(n)] false"), ["o_vres"])
  // deadlock freedom through a star; a deadlock reached through one
  assert.deepEqual(accepted("[(!exists o: Outcome . finish(o))*] <true>true"), ["finish"])
  accepted("<true*>[true]false")
  // the four inevitability patterns, either order, inside quantifiers and boxes
  accepted(
    "forall n: Node . [true* . expand(n)] mu X . ([!((exists t: Node . link(n, t)) || (exists c: FCause . fail(n, c)))] X && <true>true)",
  )
  accepted("[true*] mu X . (<true>true && [!a] X)")
  accepted("[true*] mu X . [!((exists n: Node . complete(n)) || finish)] X")
  accepted("<true*> nu Y . (<!a> Y || [true]false)")
  accepted("<true*> nu Y . <true> Y")
  // boolean structure, implication, val, comments
  accepted("% a comment\n!([true*.a]false) => (val(1 < 2) || [true*.b]false) && true")
  // val in an action formula: decided when it does not matter for τ
  assert.deepEqual(accepted("[true* . exists o: Outcome . val(o != OSUCCESS) && finish(o)] false"), ["finish"])
})

test("LTS route check: each form outside the fragment is refused, naming the subformula and the rule", () => {
  refused("[true]false", /"true" is a single step that includes τ/)
  refused("<!a>true", /single step that includes τ/)
  refused("[a]false", /"a" is a visible step not right after a τ-closed star/)
  refused("[true* . a . b]false", /"b" is a visible step not right after/)
  refused("[a*]false", /a star of something other than an action formula that includes τ/)
  refused("[(true . true)*]false", /a star of something other than/)
  refused("[true+ . a]false", /R\+, which requires at least one step/)
  refused("[true* . a]<true>true", /single step that includes τ/) // deadlock freedom after a visible step is not preserved
  refused("[true*][true]false", /single step that includes τ/) // joined: every reachable state a deadlock
  refused("<true*><true>true", /single step that includes τ/)
  refused("mu X . ([a]X && <true>true)", /a fixpoint other than the four inevitability patterns/) // α must include τ
  refused("mu X . ([true]X && <a>true)", /fixpoint other than/)
  refused("nu X . [true*]X", /fixpoint other than/)
  refused("mu X . [true]Y", /fixpoint other than/)
  refused("X", /the fixpoint variable X outside its pattern/)
  refused("[true* . val(b)]false", /val\(…\) leaves undecided whether it includes τ/)
  // outside the syntax the check reads
  refused("[true* . tau]false", /cannot read the formula: tau in an action formula/)
  refused("[true* . a | b]false", /a multi-action/)
  refused("[true* . a@1]false", /a timed action/)
  refused("mu X(n: Nat = 0) . [true]X(n+1)", /a parameterised fixpoint/)
  refused("delay@2", /a time operator/)
  refused("[true*]false false", /text after the formula/)
})

test("LTS route check: includes τ is three-valued, Kleene's connectives over val", () => {
  const act = (src: string) => {
    const f = parseFormula(`[${src}]true`)
    assert.ok(f.k === "box" && f.r.k === "act")
    return includesTau(f.r.a)
  }
  assert.equal(act("true"), true)
  assert.equal(act("a"), false)
  assert.equal(act("!a"), true)
  assert.equal(act("!(a || b)"), true)
  assert.equal(act("a => b"), true)
  assert.equal(act("exists x: Nat . a(x)"), false)
  assert.equal(act("val(b)"), undefined)
  assert.equal(act("val(b) && a"), false)
  assert.equal(act("val(b) || true"), true)
  assert.equal(act("!val(b)"), undefined)
})

test("LTS route check: a label's actions are read at the bars outside brackets", () => {
  assert.deepEqual(labelActions("tau"), [])
  assert.deepEqual(labelActions("finish(OSUCCESS)"), ["finish"])
  assert.deepEqual(labelActions("a(f(1, [x | y]))|b"), ["a", "b"])
  assert.deepEqual(labelActions("a(x || y)"), ["a"])
  assert.equal(labelActions("a(("), null)
  assert.equal(labelActions("(weird)"), null)
})
