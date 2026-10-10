# verifier-mcrl2: an LTS route — generate the state space once per model, hide and reduce per formula, solve on the LTS — with a cross-check against the standard route

On a model whose state space is small but whose data is heavy, the mCRL2
verifier's standard route spends hours rewriting data: `pbessolve` on the
linearised process pays the next-state function once per BES equation. In
the VoxLogicA-2 scheduler model the nested-loop instance has 4,862 states,
yet both of its liveness properties ran for more than 11 hours (10–70 BES
equations per second). Generating the labelled transition system once with
`lps2lts`, hiding per formula the actions it does not mention, reducing modulo
divergence-preserving branching bisimilarity and solving `lts2pbes` gave both
verdicts in about 2 s after an 85 s generation, and agreed with the standard
route on the smaller instances, a false control included (VoxLogicA-2 diary,
2026-10-10).

The verifier offers it as a route chosen per property in `verifierOptions`,
sound only for formulas whose meaning the reduction preserves, which Naima
checks syntactically and refuses otherwise; the LTS is generated once per
model version and shared by every property on it; each run records the route,
the sizes and the tool versions; and a cross-check mode runs both routes and
requires the same verdict.
