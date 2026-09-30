# The Naima skill loads in an agent tool and its links resolve

## Gesture

1. `ln -s <path-to-naima>/skills/naima ~/.claude/skills/naima` (see
   `docs/skill.md`), then start an agent session in a git repository with no
   `naima/` and ask it to start tracking the repository with Naima.
2. `naima check` in Naima's repository.

Pass: the agent tool lists the `naima` skill, the agent runs `npx naima init`
(or, with no `naima` available, says how to get one: npx, or clone and link),
and `check` reports no broken link in `skills/naima/SKILL.md`.

## Result

2026-09-30, the author (agent): step 2 and the automated half pass —
`src/skill.test.ts` parses the front matter (`name: naima`, a description)
and finds every link resolving, `attachments/skill-test-2026-09-30.txt`.
Step 1 not yet performed.
