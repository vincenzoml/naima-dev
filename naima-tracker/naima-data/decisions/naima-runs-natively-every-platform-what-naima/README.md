# Naima runs natively on every platform; what Naima can ship it ships, rather than asking users to maintain it

## The owner's words, restated

Running Naima inside WSL on Windows is not simpler: it creates a friction
point for users. What we can ship is always simpler than what users have to
maintain.

## What this means

- Naima runs natively on Windows, macOS and Linux; no platform asks the user
  to set up an environment for Naima itself.
- A tool with no native build for a platform (Storm on Windows: its Python
  package ships only macOS and Linux builds) is Naima's problem to solve and
  to ship — reaching a Linux environment only for that tool, behind the
  plugin — not the user's to arrange. Where a precondition truly cannot be
  shipped (turning WSL on needs Windows admin rights), `naima tools` says so
  plainly and says what to do.

## Why

Every step the user must maintain is a step that breaks on someone's machine;
a step Naima ships is tested once, by us.

## Worth asking again when

Shipping a tool for a platform costs more than the users on it justify.
