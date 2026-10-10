# The LTS route decides a property on the state space: generated once, hidden and reduced per formula modulo divergence-preserving branching bisimilarity, solved by lts2pbes and pbessolve; a false verdict is confirmed and explained on the unreduced LTS

Specification: specs/verifier-mcrl2-lts-route-cross-check, section 2.

Checked by: with route lts, the tools run in the order of §2 with the arguments it names (lps2lts once, ltsconvert --tau of the unmentioned actions with dpbranching-bisim, lts2pbes and pbessolve on the reduced LTS); on false, lts2pbes -c and pbessolve with evidence on the unreduced LTS give the counterexample, and a true there is an error; live, the real tools give the standard route's verdicts on a fixture model.

Why: the standard route rewrites data once per BES equation; on the VoxLogicA-2 nested instance (4,862 states) it ran past 11 h where this route took seconds after the generation.
