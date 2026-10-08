# The links check reads markdown with regular expressions: valid links to HTML anchors are reported broken, and other CommonMark constructs are misread

The `links-resolve` check of the `docs` plugin (`naima/src/plugins/docs/index.ts`) does not parse
markdown: it reads each file line by line with hand-written regular expressions — `ATX`,
`UNDERLINE`, `PARAGRAPH` and `FENCE` for headings, and `\]\(([^)\s]+)…\)` for links, after
stripping code spans with `` `[^`]*` ``.

**What happens.** In a project with a long markdown manual (the NEARBYTES pitch repository,
2026-10-08), `naima check` failed with 174 problems in its scope; 168 of them were links to
anchors declared as HTML (`<a id="src-3"></a>`, `## Title <a id="lex-definition"></a>`), which
resolve in every browser and on GitHub. **What should happen:** a link is reported only when
its target does not exist for a CommonMark/GFM renderer.

**Read in the code, certain:**
- anchors come only from ATX and setext headings; `<a id>`, `<a name>` and any HTML `id` are
  never collected;
- links are matched only in the inline form `](target "title")`: reference links
  (`[text][ref]` with `[ref]: url`), link targets in `<…>`, and targets containing balanced
  parentheses are missed or misread;
- the code-span stripper handles only single backticks; a span delimited by two or more
  backticks, or holding a backtick, leaves its text in place;
- raw HTML blocks, indented code blocks and links in multi-line constructs are not modelled.

**Not measured:** how many projects other than the one above are affected.

**Consequence.** Every project with HTML anchors fails `naima check` on links that work, so the
check is either switched to a note or its scope narrowed — and a check that cries wolf hides
the real broken links it exists to find.

**The fix asked for:** parse with a CommonMark/GFM parser and walk its tree (headings, HTML
anchors, links and definitions), never with line regexes — the project's rule on
state-of-the-art methods.
