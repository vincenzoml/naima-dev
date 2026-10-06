# Specify Naima itself: requirements and a current specification for the core and every plugin, before new features are built

## Why

Naima holds other projects to requirements, specifications and properties,
but its own tracker has none: 42 features, 6 properties, 0 requirements,
0 specifications. The owner wants Naima to be an exemplar of well specified
software, described in a paper. New features (external tools, a Storm
verifier) should go through the same path: requirements, a current
specification, then code that is checked against it.

## Done when

Every plugin and the core have requirements items and a current
specification; existing tests and properties are linked to the requirements
they prove; new features are `specified-by` a current specification before
work on them starts.
