# Dependencies drive the work: a ready list, a topological order, no cycles

Items already say what they wait on (`blocked-by`, inverse `blocks`), but nothing
reads that for planning: a project whose plan is a graph of dependencies -- a
specification waiting on its requirements, a generator on a verified model --
has to be walked by hand to know what can start now.

Done:

- `naima ready` lists the open items whose every `blocked-by` target is
  settled (done or closed), in a topological order of the whole graph, so an
  agent working through a plan takes the next one without reading the rest.
- `naima order` prints the full topological order of the open items, with the
  depth of each (how many waits stand before it).
- `naima check` fails on a cycle of `blocked-by` links, naming the items on it:
  a cycle is a plan that can never start.
- Documented for people and agents, the reference regenerated.

Asked by the owner on 2026-10-05, while planning the reimplementation of
VoxLogicA 2 as a graph of 47 items in VoxLogicA-2-clean.
