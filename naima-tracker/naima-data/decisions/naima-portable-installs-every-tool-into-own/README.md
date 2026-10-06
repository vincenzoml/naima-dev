# Naima is portable: it installs every tool into its own discardable directory, never into the system

## The owner's words, restated

Naima must be a portable system, able to install all of its tools (mCRL2,
Storm, and whatever a plugin needs, including runtimes such as a Java) into
a discardable directory.

## What this means

- No system package manager (Homebrew, apt), no root, no writes outside
  Naima's tool directory; nothing installed on the machine's PATH.
- Deleting the directory removes every tool and leaves the machine as it was;
  running again reinstalls.
- A tool that cannot be installed this way (only a system package, or only a
  container) needs its own plugin answer, recorded per tool.

## Why

The same Naima runs on a laptop, a measurement server and a co-author's
machine; installing into the system there is intrusive, needs privileges and
leaves residue. A discardable directory makes installing safe to do on
consent and trivial to undo.

## Refines

The decision that Naima installs a plugin's tools on the machine it runs on
(naima-installs-plugin-s-tools-machine-runs): *where* on that machine is now
fixed.

## Worth asking again when

A tool exists only as a system package or a container image, or the
directory's size becomes a problem.
