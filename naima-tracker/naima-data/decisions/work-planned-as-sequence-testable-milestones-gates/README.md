# Work is planned as a sequence of testable milestones

## The owner's words, restated (2026-10-08)

Re-planning around a walking skeleton should be part of Naima's working
method: reorder gates and subdivide them into pre-release, testable
milestones, each of which can already give valuable feedback or even steer
the development.

## Where it came from (VoxLogicA-2-clean)

After two days, the reimplementation had about 300 requirements, eight
specifications, a verified model, a code generator and many tested
components — and no program that ran. Gates followed the architecture
(requirements, specification, model, generator, store, execution,
primitives, engine, correctness, performance), so every phase stayed open
and nothing could be tried. The owner asked "how far are we to a testable
2.1?"; the honest answer was "a few days, nothing runs yet", and the fix was
a `walking-skeleton` gate: the shortest path to a first program running end
to end, changing only the order of existing work.

## What this means for Naima

- A plan is a sequence of milestones, each proved by something a person can
  run (a program, a command, a page), not by a phase being complete.
- The first milestone is a walking skeleton: the thinnest end-to-end slice.
  Later milestones widen it (more programs, then correctness, then
  performance), each one still runnable.
- Splitting keeps the final state the same: an item too big for a milestone
  is split into the slice it needs and the rest, both tracked; no throwaway
  work.
- Each milestone's result is fed back: what it reveals can reorder or change
  the remaining gates — the owner steers from working software.
- Architecture-ordered gates (requirements, specification, …) remain, but as
  conditions a milestone must meet for its slice, not as phases that must
  finish first.

## To do in Naima

Commands to declare gate order and to split an item (both done by hand
today, see the todo on hand edits of naima.json), and `naima plan`/`queue`
showing the next milestone and what it proves.
