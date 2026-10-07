# Diary entries point at the items they are about

## The owner's question (2026-10-07)

Should diary entries mark changes, specific items, or what? The diary is a
linear timeline; issues are parallel timelines.

## Seen in VoxLogicA-2-clean

42 diary events in two days, written by workers; each cites items only as
text ("todos/front-end-naming-…, partial"), so nothing links the two
timelines. The stepping stones the owner wants to collect for the paper —
"the formal model found three design faults before any code existed" — are
in the diary, but cannot be found from the items, nor filtered out of the
routine entries.

## Proposal

- **Two timelines, joined by links.** A diary entry stays one linear moment;
  it carries structured `about: [item ids]` (validated by `naima check`).
  Each item's page shows "In the diary" — its moments in order — so a thread
  reads as its own story; `naima diary <item>` filters the diary to one
  thread (and its linked items, to a depth).
- **Mark what matters, not every change.** Commits and status changes are
  already on the derived timeline (`naima view timeline`); the diary holds
  only what a person would tell. A `--kind finding` (or a `milestone` flag)
  marks the stepping stones: a model counterexample that changed a spec, a
  metric that moved, an owner decision that reversed a plan. `naima diary
  --findings` is then the paper's raw material, each line linked to its
  evidence.
- **Retro-fit:** a command that proposes `about` links for existing entries
  from the item paths they cite in text.

Specify before implementing (owner's standing request: Naima is specified as
rigorously as the projects it tracks).
