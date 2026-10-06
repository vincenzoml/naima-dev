# Naima installs a plugin's tools on the machine it runs on, wherever that is

## The owner's words, restated

Tools such as mCRL2 and Storm are reached through plugins and presented as
plugins; agents may write the plugins that fit; Naima may install the tools
a plugin needs on whatever machine it is running on, when the work needs
them.

## Why

The work runs where the tools are needed — a laptop for model checking, a
measurement server for benchmarks — and Naima runs there too. Installing
where Naima runs needs no remote access, no second set of credentials and no
model of other machines: a project worked on from two machines installs on
each when it first runs there.

## Worth asking again when

A tool must be installed on a machine where Naima does not run, or a
project needs one machine to prepare another.
