# A locked resource is touched only by its holder

A locked resource — one declared in the coordination plugin's `resources` option, such as the published site, the product's main branch or the release tags — is touched only by the branch that holds its claim (`naima claim --resource <name>`). Take the claim before touching it, release it when done; when another branch holds it, file the change as an item for the holder instead of doing it.

Why: two sessions published the site in the same window, and one deleted a folder the other had set aside: without one holder, concurrent work on a shared resource destroys work no one can see being done.
