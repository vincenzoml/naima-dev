# The links check reads CommonMark: links to HTML anchors resolve, a missing anchor is still reported

**Where:** this repository, after `git submodule update --init`.

**Do:** `deno test -A test/plugins/docs/commonmark.test.ts test/plugins/docs/docs.test.ts test/docs-pages.test.ts test/skill.test.ts`, then `deno task verify`.

**Must appear:** every test passes. In particular *the case reported*: a markdown file with
`<a id="src-3"></a>` and `## Lexicon <a id="lex-definition"></a>`, linked from a table, yields
exactly one problem — the link to the anchor that does not exist (`#src-99`), and none for the
two that do. The negative half: the missing anchor is still caught.

**Red before green (2026-10-08):** the same fixture through `brokenLinks` of the docs plugin at
product f75e57b (before the fix) reported three problems — `#src-3`, `#lex-definition` and
`#src-99`; with the fix, one — `#src-99`. The run is attached (`red-green-links-check.log`).

## Notes

### 2026-10-08 — claude, on claude/links-commonmark

Passed on 2026-10-08: commonmark.test.ts 10/10 and the docs, docs-pages and skill tests (31 on Deno; the same files pass on Node and Bun); the reported fixture gives one problem (#src-99) where the code before the fix gave three. Product commit 089209c.
