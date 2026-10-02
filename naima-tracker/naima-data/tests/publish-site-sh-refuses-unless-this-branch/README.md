# publish-site.sh refuses unless this branch holds the site claim, records it on the gh-pages commit, and the audit flags a publish without it (test/site-claims.test.ts, on Deno, Node and Bun)

The gesture that proves it, step by step, and what a pass looks like.

## Result

What was seen, when, and by whom.

## Notes

### 2026-10-02 — Vincenzo Ciancia, on claude/resource-claims

Red first: the two publish-site.sh tests failed before the script asked for the claim. Green: deno task verify 402/402 passed, node --test 402/402, bun test 402/402, 0 failed, on claude/resource-claims at 8b85db1 (product 395c933). Live, on the real gh-pages: a dry run without the claim was refused (site free), and with it built and found gh-pages already serving the build; attached.
