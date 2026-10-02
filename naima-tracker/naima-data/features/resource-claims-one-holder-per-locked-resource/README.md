# Resource claims: one holder per locked resource

Some things in a project are touched by one session at a time: the published site, the product's main branch, the release tags. An item claim may be shared; a resource claim is exclusive. `naima claim --resource <name>` takes a resource for this branch and is refused, naming the holder, when another branch holds it; `naima release --resource <name>` gives it back; `naima claims --resources` lists every declared resource with its holder or free; `naima prune` lists holders whose branch is gone. The resources are declared as data in naima.json (the coordination plugin's `resources` option), so a project adds its own.

Done: the three commands and the prune listing work and are tested; the workshop declares `site`, `product-main` and `releases`; scripts/publish-site.sh refuses unless the caller holds `site`, records the claim in the gh-pages commit, and a check flags a gh-pages publish commit made without it; documented for people and agents.

## Notes

### 2026-10-02 — Vincenzo Ciancia, on claude/resource-claims

The product commit is 395c933 on github.com/vincenzoml/naima main (the coordination plugin's resources, claim/release --resource, claims --resources, prune, the resources-one-holder check); the workshop commit 8b85db1 records it as the submodule pointer and the lock, which is why commits names only the workshop's.
