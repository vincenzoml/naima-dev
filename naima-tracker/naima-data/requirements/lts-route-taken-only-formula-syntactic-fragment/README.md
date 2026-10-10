# The LTS route is taken only for a formula in the syntactic fragment the reduction preserves and an LTS whose multi-actions never join a hidden action to another; otherwise the run is an error saying why, never a verdict and never a silent fallback

Specification: specs/verifier-mcrl2-lts-route-cross-check, sections 3.1 to 3.4.

Checked by: the fragment check accepts every form of §3.1 (weak paths, the deadlock bodies after a star, the four inevitability patterns, joined nested modalities) and refuses each form outside it (a single step including tau, a visible step first or after another, R+, tau, multi-actions, parameterised fixpoints, a fixpoint outside the patterns), naming the subformula; a mixed multi-action label is refused; a refused run is an error beginning 'LTS route refused:' and starts no tool after the refusal.

Why: hiding and the reduction preserve only formulas that neither count nor skip internal steps; a verdict outside them could be wrong without anything showing it.
