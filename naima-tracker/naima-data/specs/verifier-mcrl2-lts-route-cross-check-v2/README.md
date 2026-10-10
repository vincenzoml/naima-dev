# verifier-mcrl2: the LTS route and the cross-check v2

The behaviour, said so that it can be checked: what goes in, what comes out,
and the cases at the edges. The feature it specifies is
features/verifier-mcrl2-lts-route-generate-state-space.

## 0. The problem

The mCRL2 verifier (`verifier-mcrl2`) decides a property by the toolset's
standard route: `mcrl22lps`, `lps2pbes --counter-example`, `pbessolve` on the
linear process (LPS). `pbessolve` instantiates the parameterised boolean
equation system (PBES) into a boolean one (BES), evaluating the LPS's
next-state function, data rewriting included, once per BES equation. On a
model whose state space is small but whose data is heavy this is the whole
cost: in the VoxLogicA-2 scheduler model, the nested-loop instance has 4,862
states and 6,747 transitions, yet each of its two liveness properties ran for
more than 11 hours, at 10 to 70 BES equations per second. Generating the
labelled transition system (LTS) once with `lps2lts` (85 s), then per formula
hiding the actions it does not mention, reducing modulo divergence-preserving
branching bisimilarity and solving `lts2pbes` gave both verdicts in about 2 s
each, and agreed with the standard route on the smaller instances, a false
control formula included (VoxLogicA-2 diary, 2026-10-10).

The reduction is sound only for formulas whose truth it preserves. This
specification adds the route, the check that decides when it may be taken, the
cache that makes the generation happen once, the evidence a run records, and
a mode that runs both routes and requires them to agree.

## 1. Choosing a route

A property item chooses its route in `verifierOptions`, which the run digest
already covers (changing it reopens the property):

- `route` — `"lps"` (absent means `"lps"`): the standard route, unchanged;
  `"lts"`: the LTS route of §2; `"cross-check"`: both, §6. Any other value is
  an error run that names the three.
- `threads` — a positive integer, the `--threads` given to `lps2lts` when the
  LTS route generates an LTS; absent means 1, the tool's own default (more
  threads can exhaust the thread stack on macOS, as `lps2lts --help` warns).
  It does not change the LTS, so it is not part of the cache key (§4). Not a
  positive integer: an error run.
- `timeoutSeconds` — as before: the time limit of each step; a step that
  reaches it makes the run `unknown`.

## 2. The LTS route

For a property with model `M` and formula `f` (inline, or an `.mcf` file):

1. **The formula is checked** (§3.1) before any tool starts. A formula outside
   the fragment is an error run, §3.4.
2. **The LTS of the model**, from the cache (§4) or generated into it:
   `mcrl22lps M model.lps`, then `lps2lts [--threads=N] model.lps model.lts`,
   then `ltsinfo --action-label model.lts` for its states, transitions and
   action labels.
3. **The hidden actions** `H`: every action name occurring in a label of the
   LTS that `f` does not mention (§3.2), sorted. The labels are checked
   (§3.3); a label that fails is an error run, §3.4.
4. **Hide and reduce**: `ltsconvert --tau=<H, comma-separated>
   --equivalence=dpbranching-bisim model.lts reduced.lts` (no `--tau` when `H`
   is empty), then `ltsinfo reduced.lts` for its size.
5. **Solve**: `lts2pbes --formula=f reduced.lts reduced.pbes`, `pbessolve
   reduced.pbes`. `true` holds; any answer other than `true` or `false` is
   `unknown`, as on the standard route.
6. **A counterexample, on `false`**: `lts2pbes --counter-example
   --formula=f model.lts full.pbes` on the unreduced, unhidden LTS, `pbessolve
   --file=model.lts --evidence-file=evidence.lts full.pbes`, then `ltsconvert
   evidence.lts evidence.aut`; the `.aut` text is the counterexample, over the
   model's own actions. This second solve is also a check: if it does not
   answer `false`, the run is an `error` that says the reduced and the
   unreduced LTS disagree, and gives no verdict.

A tool that is missing, fails or reaches the time limit is handled as on the
standard route: `tool missing: …`, an error with its output, `unknown`.

**Progress.** On either route, `lps2lts` and `pbessolve` are also given
`--verbose`: their counting lines — the states explored, the BES equations
generated — are read as the run's progress
(specs/progress-long-work-says-how-far, §6) and are not kept in the output;
every other line they print is. `--verbose` changes no LTS, so it is no part
of the cache key (§4).

## 3. When the route is sound

The verdict on the reduced LTS equals the verdict of the standard route when
two facts hold.

- **Hiding changes nothing**: an action formula that does not mention the
  name `a`, and does not mention `tau`, cannot tell an action `a(d)` from the
  internal action τ — each of its action atoms is false on both, `true` is
  true on both, `val(…)` depends on data only, and the boolean connectives
  and quantifiers combine equal values. So
  renaming every unmentioned action to τ preserves the truth of any formula
  that mentions neither them nor `tau`, provided no transition carries a
  multi-action that joins a hidden action to another one (§3.3).
- **The reduction changes nothing**: divergence-preserving branching
  bisimilarity (branching bisimilarity with explicit divergence, van Glabbeek
  and Weijland; the equivalence `ltsconvert` calls `dpbranching-bisim`)
  preserves the properties that do not count internal steps but do see
  divergence: action-based CTL* without next (De Nicola and Vaandrager), and
  the modal mu-calculus fragment adequate with it (Mateescu and Wijs, the
  fragment L_mu^dsbr). Plain branching bisimilarity is not enough: it may
  erase a τ-cycle, which is a counterexample to a least fixpoint over τ-steps.

Naima does not decide membership of that fragment in general. It checks a
smaller, syntactic fragment, §3.1, every formula of which has a direct
argument (§3.5), and refuses the route for everything else.

### 3.1 The fragment Naima accepts

The formula is parsed by Naima's own parser of the mCRL2 state-formula
syntax, restricted to: `true`, `false`, `!`, `&&`, `||`, `=>`, `forall` and
`exists` over data variables, `[R]φ`, `<R>φ`, `mu X . φ`, `nu X . φ`, a
variable `X`, `val(…)`, parentheses, and `%` comments. Regular formulas `R`:
an action formula, `nil`, `R . R`, `R + R` (choice), `R*`, `R+`. Action
formulas: `true`, `false`, `val(…)`, an action `a` or `a(…)` (data arguments,
sorts and `val` arguments are skipped, not interpreted), `!`, `&&`, `||`,
`=>`, `forall` and `exists`. A formula using anything else — a parameterised
fixpoint `X(…)`, `delay`, `yaled`, `@` time, a multi-action `a | b`, `tau`, a
quantitative operator, a bare data expression — is outside the fragment.

An action formula `α` **includes τ** when it is true of τ, computed
syntactically in three values: `true` yes, `false` and every action no,
`val(…)` unknown (its value does not depend on the action), the connectives
as Kleene's three-valued operations, a quantifier as its body. An action
formula in a position where the rule below asks whether it includes τ, and
for which the answer is unknown, is outside the fragment. A **τ-closed star** is `α*` with
`α` an action formula that includes τ. A **visible step** is an action
formula that does not include τ.

Nested modalities of one kind are joined first: `[R1][R2]φ` is read as
`[R1 . R2]φ`, `<R1><R2>φ` as `<R1 . R2>φ` (the same formula). Then a formula
is **in the fragment** when it is built by:

- `true`, `false`, `val(…)`;
- `!φ`, `φ && ψ`, `φ || ψ`, `φ => ψ`, `forall v: S . φ`, `exists v: S . φ`,
  with `φ`, `ψ` in the fragment;
- `[R]φ` or `<R>φ` with `R` a **weak path** and either `φ` in the fragment,
  or, when `R` ends in a τ-closed star, `[R]<true>true` (deadlock freedom
  through the star) and `<R>[true]false` (a deadlock reached through it) —
  after the joining above, `[R][true]false` and `<R><true>true` are not this
  case, and are not preserved;
- one of four **inevitability patterns**, `α` an action formula that includes
  τ: `mu X . ([α]X && <true>true)` (every maximal path leaves α: performs an
  action outside it), `mu X . [α]X` (no infinite α-path), and their duals
  `nu X . (<α>X || [true]false)` and `nu X . <α>X`; the two conjuncts or
  disjuncts in either order. `X` occurs nowhere else.

A **weak path** is a regular formula in which every visible step is
immediately preceded by a τ-closed star, and nothing else steps: from left to
right, `nil` is skipped, a τ-closed star may come anywhere, a visible step
only right after a τ-closed star, and a choice `R1 + R2` is a weak path when
both branches are, ending in a star only when both do. A single step that
includes τ (`[true]`, `[!a]` outside the patterns), a visible step first or
right after another visible step, `R+`, and a star of anything but an action
formula that includes τ are not weak paths: they count or skip internal
steps, which the reduction does not preserve.

### 3.2 The mentioned actions

The actions `f` mentions are the names of the actions in its action formulas,
wherever they occur. Every other action name in the LTS's labels is hidden.

### 3.3 The labels

Each LTS label is a multi-action `a1(…)|…|an(…)`, or `tau`. Its action names
are read by splitting it at the `|` outside parentheses and brackets and
taking each part's name. A label with two or more actions of which at least
one is hidden makes hiding visible to the formula (`a|b` with `a` hidden
becomes `b`), so the route is refused.

### 3.4 Refusal

A refusal is an `error` run, never a verdict and never a silent fallback to
the standard route. Its output begins `LTS route refused:`, names the
subformula or label that fails and the rule of §3.1 or §3.3 it breaks, and
says that `route: "lps"` decides the property by the standard route.

### 3.5 Why each form is preserved

Write `s ≈ t` for divergence-preserving branching bisimilarity. It relates
states with the same maximal paths up to internal stuttering: a step of `s`
is matched by `t` with internal steps (between `≈`-related states) before
it, a run of `s` that ends in a deadlock by one of `t` that does, and an
infinite run of `s` by an infinite run of `t` with the same visible actions,
a divergence by a divergence.

- Boolean connectives and data quantifiers preserve preservation.
- `<α* . β>φ` with `α` including τ and `β` visible: the internal steps `t`
  inserts are α-steps, `β` is matched by `β`, and the target is `≈`-related,
  so `φ` agrees. A weak path is a sequence of these and of `α*` alone; boxes
  are the duals; choice is a disjunction.
- `[α*]<true>true` with `α` including τ: a deadlock reachable from `s` by
  α-steps is matched by a state `≈`-related to a deadlock reachable from `t`
  the same way; a state `≈` to a deadlock can only take inert τ-steps, none of
  them infinitely (divergence is preserved), so it reaches a deadlock.
- The inevitability patterns say that every maximal path from the state
  leaves `α`, or that no infinite path stays in it; maximal paths, their
  ending in deadlock or divergence, and their visible actions are what `≈`
  preserves.
- A step that includes τ by itself, `<α>φ`, is not preserved: a state with
  one τ-step to a deadlock is `≈` to that deadlock, and only one of them has a
  step.

## 4. The LTS cache

One LTS serves every property of a model at one version.

- **Where**: under the run work folder,
  `<tracker>/.naima-work/verifier-mcrl2/lts/<key>/`, inside the launcher's
  fence and ignored by git; per worktree and per machine.
- **The key**: the sha256 of the canonical JSON of the model's inputs (each
  file the run reads, from the project root, with its sha256 — the list the
  run digest covers), the mCRL2 version line (`mcrl22lps --version`), and the
  recipe (the arguments of `mcrl22lps` and `lps2lts` that change the LTS;
  `--threads` does not). A model, a file it reads or a toolset that changes
  gives another key: the old LTS is never used for it.
- **What it holds**: `model.lps`, `model.lts`, and `lts.json` — the key, the
  model path, the inputs, the version, the recipe, the LTS's sha256, states,
  transitions and action labels, the seconds the generation took, and when.
- **Reuse**: an entry is used when its `lts.json` reads, names the key, and
  the sha256 of its `model.lts` matches; otherwise it is generated again.
- **Publication**: generation happens in a fresh temporary folder beside the
  entries, renamed to `<key>` when complete; a rename that finds `<key>`
  already there (another run finished first) discards its own and uses that
  one. A reader never sees a partial LTS.
- **Superseded entries**: after publishing a key, the entries whose
  `lts.json` names the same model path with another key are removed.

## 5. The evidence a run records

A verifier result may carry `details`, a JSON object saying how the verdict
was reached; `naima verify` keeps it in the run record (`details`), and the
record check accepts it only as an object. The mCRL2 verifier fills it:

- every route: `route`, and `tools`, each program the run started mapped to
  the first line of its `--version`;
- the LTS route: `lts` — `key`, `reused` (true when taken from the cache),
  `states`, `transitions`, `generationSeconds` (of the generation that made
  it); `hidden`, the hidden action names; `mentioned`, the mentioned ones;
  `reduced` — `equivalence` (`dpbranching-bisim`), `states`, `transitions`;
  and on `false`, `counterexampleFrom: "unreduced LTS"`;
- the cross-check: `route: "cross-check"`, `lps` and `lts`, each the details
  and the verdict of that route, and `agree`.

## 6. The cross-check

`route: "cross-check"` runs the standard route, then the LTS route, on the
same formula.

- Both reach a verdict and it is the same: that verdict; the counterexample,
  when violated, is the standard route's.
- Both reach a verdict and they differ: an `error` whose output begins
  `the routes disagree:` and names each verdict.
- Either reaches none (error, unknown, refusal): `error` if either is an
  error, `unknown` otherwise; the output holds both logs.

It is meant to be run once per instance on models small enough for the
standard route, to confirm the LTS route agrees, before the large instances
use `route: "lts"` alone.

## 7. Programs

The plugin declares, and the launcher grants, `mcrl22lps`, `lps2pbes`,
`pbessolve`, `lps2lts`, `ltsinfo`, `ltsconvert` and `lts2pbes`; the `mcrl2`
tool declaration lists them all.

## 8. Design choices, and the alternatives rejected

1. **A route per property, chosen in `verifierOptions`.** Rejected: a plugin
   option for every property — the route is part of what a run speaks for,
   and the digest covers `verifierOptions`; an automatic choice by size — the
   size is known only after the expensive step.
2. **Refusing outside a syntactic fragment.** Rejected: taking the route for
   any formula — unsound for next-step and counting formulas; a decision
   procedure for the full adequate fragment — larger than any formula the
   projects write, and harder to read than the rule.
3. **Divergence-preserving branching bisimilarity.** Rejected: plain
   branching — erases τ-cycles that refute least fixpoints; strong
   bisimilarity — sound for every formula but reduces almost nothing once the
   data is in the labels; `lpsconfcheck` with confluence reduction — removes
   divergences, and on the nested instance ran past 8 GB on the first
   summand.
4. **The counterexample from the unreduced LTS.** Rejected: from the reduced
   one — its actions are τ where the reader needs the model's; skipping it —
   the second solve is also the cheapest check of the reduction.
5. **The LTS shared through a content-keyed cache in the work folder.**
   Rejected: in the tracker — generated, large, machine-local; regenerating
   per property — the generation is the expensive step.
6. **Symbolic tools** (`lpsreach`, `pbessolvesymbolic`). Rejected: not in
   every platform's build, and no faster on a long, thin state space.

## References

- R. J. van Glabbeek, W. P. Weijland. Branching time and abstraction in
  bisimulation semantics. J. ACM 43(3), 1996.
- R. De Nicola, F. Vaandrager. Three logics for branching bisimulation.
  J. ACM 42(2), 1995.
- R. Mateescu, A. Wijs. Property-dependent reductions adequate with
  divergence-sensitive branching bisimilarity. Sci. Comput. Program. 96,
  2014.

## Changes from the previous version

- §2: `lps2lts` and `pbessolve` are given `--verbose` on both routes, for
  progress; their counting lines are left out of the kept output.
