# A run records the route it took, the LTS and reduced sizes, the hidden actions, whether the LTS was reused, and the version of every tool it started

Specification: specs/verifier-mcrl2-lts-route-cross-check, section 5.

Checked by: a run through naima verify keeps the adapter's details in its run record: route, tools with versions, LTS key, reuse and sizes, hidden and mentioned actions, reduced sizes; a record whose details is not an object is reported malformed.

Why: a verdict reached by a reduction is believed only if what was reduced, and by which tools, is on record.
