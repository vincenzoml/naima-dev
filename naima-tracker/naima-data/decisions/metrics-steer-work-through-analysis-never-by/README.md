# Metrics steer the work through analysis, never by refusing a commit

## The owner's words, restated

Enforcement at commit is too much. What is needed is an analysis UI that
helps direct the work and identifies the commits where a given metric
changed.

## What this means

- No hook refuses a commit because a metric got worse; ratchets and bounds
  stay advisory, reported by `naima metrics run` and on the gates.
- The method "optimise metric by metric, commit by commit, tests green" is
  carried by visibility: every recorded run is a point on the commit
  timeline, and the UI makes regressions and gains impossible to miss.

## Why

A commit is often a step through worse numbers towards better ones;
refusing it blocks exactly that work, and noisy timings would refuse good
commits. Finding the commit that changed a metric, after the fact, is what
directs the next step.

## Worth asking again when

A regression reaches a release because nobody looked.
