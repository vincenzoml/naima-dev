# The documentation rule

> **Features are documented always, as part of their implementation.**

A feature is not done until its documentation is in the same change. This
repository follows the rule, and any project that uses Naima can switch it on
by loading the `docs` plugin; `naima check` then holds it in three places.

## 1. The manifests

Every contribution of every loaded plugin carries its documentation in the
manifest that implements it, and the `documented` check fails on one that
does not:

| Contribution | Must carry |
|---|---|
| plugin | `says`; each of its `options` a `says` |
| command | `says`, `usage`, at least one entry in `examples`, and an `options` entry for every `--flag` its usage names (and none that it does not) |
| item type, status | `says` |
| field | `says`; for an enum, a meaning for every value |
| relation, check, view, verifier | `says` |
| gate | `says` (what it is for) and `decides` (how it decides) |

`naima docs` prints the reference generated from those manifests;
`naima docs --write <file>` writes it. With the plugin's `reference` option
set, the `reference-current` check fails when the file differs from what the
code generates, so the reference cannot drift. In this repository the
development build checks it instead (see [bootstrap policy](bootstrap.md#why-the-reference-is-checked-by-the-development-build)),
and the generated file is [reference.md](reference.md).

## 2. The tracker

An item of a feature type (`features` by default) in a documented status
(`shipped` by default) names its documentation in `docs`:

```sh
naima set export-keeps-alpha status=shipped docs=docs/export.md#alpha
```

Each entry is a path from the project root, optionally `#heading`. The
`features-documented` check fails when a shipped feature names nothing, or
when a named file or heading does not exist.

## 3. The prose

With the `links` option naming markdown files or directories, the
`links-resolve` check fails on any relative link there that does not resolve —
to a file, and to a heading when it names one. It is how a project knows that
the flows its agent instructions name exist.

## Switching it on

```json
{ "name": "docs", "options": { "reference": "docs/reference.md", "links": ["README.md", "docs"] } }
```

Every option: [reference](reference.md#docs).
