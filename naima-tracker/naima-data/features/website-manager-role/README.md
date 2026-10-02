# Website manager role

One role alone publishes the project site; everyone else files a site change as an item (kind `site`), and the role's queue lists them. The role is data in naima.json (the roles plugin's `roles` option), and it holds the `site` resource while it publishes.

Done: the role is declared in the workshop's configuration, `naima queue --role website-manager` lists the site items, and the docs say how a project declares such a role.
