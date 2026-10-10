# One LTS serves every property of a model at one version: cached under a key over the model's inputs, the toolset version and the recipe, published atomically, checked by its sha256 on reuse, superseded entries removed

Specification: specs/verifier-mcrl2-lts-route-cross-check, section 4.

Checked by: two properties on one model generate the LTS once; a changed model generates a new one and removes the superseded entry; a corrupted model.lts is regenerated; a generation that finds its key already published uses that one.

Why: the generation is the expensive step of the route (85 s of the nested instance's 87 s); repeating it per property would throw that away.
