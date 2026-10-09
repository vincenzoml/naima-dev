# Standing consent for portable tool installs

## The owner's words, restated (2026-10-09)

After `naima tools install` shipped with a consent prompt, the agent asked the owner again whether it could install Deno and mCRL2 on the measurement server. The owner: "Didn't you fix Naima so the question should never be asked again?"

## What this means

- Because installs are portable (a discardable per-user directory, nothing on PATH or in the system, removable with `naima tools remove`), the owner consents once, per project, to Naima installing any tool a loaded plugin declares, on any machine the project declares; the consent is recorded in the project's tracker (who, when, the words) and every install's receipt cites it.
- With standing consent, agents run `naima tools install` (or Naima installs on first need, e.g. a verifier missing its tool) without asking; source, size, licence and checksum are still shown and recorded.
- Consent can be narrowed (a list of tools or hosts) or withdrawn; a tool whose licence is not open, or that needs root, still asks.

## Why

The question costs the owner attention for no decision: the install is reversible and contained. Consent belongs where risk is.
