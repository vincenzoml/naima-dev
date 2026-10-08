import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { runChecks } from "../../../naima/src/core/api.ts"
import { tempProject } from "../../core/testing.ts"
import docs, { anchorsOf } from "../../../naima/src/plugins/docs/index.ts"
import { htmlAnchorsOf, parseMarkdown } from "../../../naima/src/plugins/docs/commonmark.ts"

// The CommonMark parser behind the links check (CommonMark 0.31.2): each case
// is a construct a line-by-line scan with regular expressions got wrong.

const targets = (md: string): string[] => parseMarkdown(md).links.map((l) => l.target)

test("anchors declared in HTML are anchors: an inline <a id>, an id after a heading, an HTML block, <a name>", () => {
  const md = [
    '<a id="src-3"></a>',
    "",
    'Some text with <span id="inline-anchor">a span</span>.',
    "",
    '## What the company is <a id="lex-definition"></a>',
    "",
    '<div id="block-anchor">',
    "",
    "</div>",
    "",
    '<a name="old-style">x</a> and <p name="not-an-anchor">p</p>',
    "",
    '<!-- <a id="commented-out"></a> -->',
  ].join("\n")
  const anchors = anchorsOf(md)
  for (const a of ["src-3", "inline-anchor", "lex-definition", "block-anchor", "old-style", "what-the-company-is"]) assert.ok(anchors.has(a), a)
  assert.ok(!anchors.has("not-an-anchor"), "name is an anchor only on <a>")
  assert.ok(!anchors.has("commented-out"), "a comment declares nothing")
})

test("htmlAnchorsOf reads attributes, quoted or not, in any case", () => {
  assert.deepEqual(htmlAnchorsOf(`<A ID=one></a><h2 class="x" id='two'>t</h2><a name="three" href="#x">`), ["one", "two", "three"])
})

test("headings in any container are anchors, and their text is what a renderer shows", () => {
  const md = "- ## In a list\n\n> ### Quoted *emphasis* `code` [link](x.md)\n\n## snake_case_name\n\n## **Bold** and _under_\n"
  assert.deepEqual([...anchorsOf(md)], ["in-a-list", "quoted-emphasis-code-link", "snake_case_name", "bold-and-under"])
})

test("reference links: full, collapsed and shortcut resolve through their definitions; a definition's own target is checked", () => {
  const md = '[full][ref] and [Ref][] and [ref]\n\n[ref]: target.md "title"\n[unused]: <other file.md>\n'
  assert.deepEqual(targets(md).sort(), ["other file.md", "target.md"], "each definition once, with its target unescaped")
  assert.deepEqual(parseMarkdown(md).links.find((l) => l.target === "target.md")?.line, 3, "a definition is reported on its own line")
})

test("destinations: pointy with spaces, balanced parentheses, escapes; titles in three quotings", () => {
  assert.deepEqual(targets("[a](<my file.md>) [b](file(1).md) [c](a\\)b.md) [d](x.md \"t\") [e](y.md 't') [f](z.md (t)) [g]()"), [
    "my file.md",
    "file(1).md",
    "a)b.md",
    "x.md",
    "y.md",
    "z.md",
    "",
  ])
})

test("code is not prose: code spans of any length, fenced and indented blocks, HTML blocks hide their links", () => {
  const md = [
    "``code with ` and [no](a.md)`` then [yes](b.md)",
    "",
    "```",
    "[fenced](c.md)",
    "```",
    "",
    "    [indented](d.md)",
    "",
    "<div>",
    "[in html block](e.md)",
    "</div>",
    "",
    "~~~~",
    "``` not a closing fence",
    "[still fenced](f.md)",
    "~~~~",
  ].join("\n")
  assert.deepEqual(targets(md), ["b.md"])
})

test("an inner link wins over an outer bracket, and images count as links", () => {
  assert.deepEqual(targets("[outer [inner](i.md)](o.md) ![alt](pic.png)"), ["i.md", "pic.png"])
})

test("each link carries the line it starts on, in multi-line paragraphs and containers", () => {
  const md = "# T\n\nfirst line\nsecond [here](a.md) and\nthird [there](b.md)\n\n> quoted\n> [q](c.md)\n\n- item\n  [i](d.md)\n"
  assert.deepEqual(parseMarkdown(md).links.map((l) => [l.target, l.line]), [["a.md", 4], ["b.md", 5], ["c.md", 8], ["d.md", 11]])
})

test("autolinks are links to absolute URIs, and are not checked against the disk", async () => {
  assert.deepEqual(targets("<https://example.org/x> <me@example.org>"), ["https://example.org/x", "mailto:me@example.org"])
  const p = tempProject([docs({ links: ["docs"], featureTypes: [] })])
  try {
    mkdirSync(join(p.root, "docs"))
    writeFileSync(join(p.root, "docs", "a.md"), "# A\n\n<https://example.org/missing.md> [web](https://x.invalid/y.md)\n")
    assert.deepEqual((await runChecks(p.ctx)).problems.map((f) => f.message), [])
  } finally {
    p.cleanup()
  }
})

test("the case reported: links to <a id> anchors in a long manual resolve; a missing one is still caught", async () => {
  const p = tempProject([docs({ links: ["docs"], featureTypes: [] })])
  try {
    mkdirSync(join(p.root, "docs"))
    writeFileSync(join(p.root, "docs", "appendix.md"), '# Appendix\n\n<a id="src-3"></a>\n\nturn three\n\n## Lexicon <a id="lex-definition"></a>\n')
    writeFileSync(
      join(p.root, "docs", "coverage.md"),
      "| line | where |\n|---|---|\n| 3 | [src](appendix.md#src-3) |\n| x | [def](appendix.md#lex-definition) |\n| y | [gone](appendix.md#src-99) |\n",
    )
    assert.deepEqual((await runChecks(p.ctx)).problems.map((f) => f.message), [
      "docs/coverage.md:5: link appendix.md#src-99 — docs/appendix.md has no heading #src-99",
    ])
  } finally {
    p.cleanup()
  }
})
