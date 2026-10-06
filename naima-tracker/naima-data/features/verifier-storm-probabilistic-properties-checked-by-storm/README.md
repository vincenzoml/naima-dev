# verifier-storm: probabilistic properties checked by Storm, as evidence like any other property

## Why

The VoxLogicA 2 reimplementation needs a quantitative model (memory, disk,
completion time) checked with Storm or PRISM, and shown to be an
abstraction of the mCRL2 model. Today only mCRL2 and VoxLogicA verifiers
exist.

## Open for the specification

Model languages (PRISM, JANI), property language (PCTL/CSL with a bound:
holds / violated; a quantity without a bound as a number, recorded as a
metric?), the tool it needs (declared through the external-tools feature),
and whether an abstraction check between two models (mCRL2 `ltscompare`) is
a property of its own kind.
